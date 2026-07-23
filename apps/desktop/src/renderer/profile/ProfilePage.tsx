import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, unwrap } from '../api';

const FIELDS = [
  ['fullName', 'profile.fullName'],
  ['title', 'profile.title'],
  ['license', 'profile.license'],
  ['phone', 'profile.phone'],
  ['email', 'profile.email'],
  ['address', 'profile.address'],
] as const;

type FieldKey = (typeof FIELDS)[number][0];

export function ProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<FieldKey, string>>({
    fullName: '',
    title: '',
    license: '',
    phone: '',
    email: '',
    address: '',
  });
  const [message, setMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => unwrap(window.ajnutrition.profile.get()),
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (profile) {
      setForm({
        fullName: profile.fullName,
        title: profile.title ?? '',
        license: profile.license ?? '',
        phone: profile.phone ?? '',
        email: profile.email ?? '',
        address: profile.address ?? '',
      });
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.ajnutrition.profile.save({
          fullName: form.fullName,
          title: form.title.trim() || undefined,
          license: form.license.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setMessage(t('profile.saved'));
    },
    onError: (err) => setMessage(err instanceof ApiError ? err.message : String(err)),
  });

  const logoMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.profile.setLogo()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
    onError: (err) => setMessage(err instanceof ApiError ? err.message : String(err)),
  });

  if (profileQuery.isLoading) {
    return <p className="text-sm text-slate-500">{t('profile.loading')}</p>;
  }

  return (
    <section aria-labelledby="profile-heading" className="max-w-2xl">
      <h2 id="profile-heading" className="mb-1 text-lg font-semibold">
        {t('profile.heading')}
      </h2>
      <p className="mb-6 text-sm text-slate-500">{t('profile.intro')}</p>

      {message && (
        <p
          role="status"
          className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm"
        >
          {message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          saveMutation.mutate();
        }}
        noValidate
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map(([key, labelKey]) => (
            <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`profile-${key}`} className="mb-1 block text-sm font-medium">
                {t(labelKey)}
              </label>
              <input
                id={`profile-${key}`}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <button
          type="submit"
          disabled={saveMutation.isPending || form.fullName.trim() === ''}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {saveMutation.isPending ? t('profile.saving') : t('profile.save')}
        </button>
      </form>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-2 text-sm font-semibold">{t('profile.logo')}</h3>
        {profileQuery.data?.logoDataUrl && (
          <img
            src={profileQuery.data.logoDataUrl}
            alt={t('profile.logo')}
            className="mb-3 max-h-20"
          />
        )}
        {profileQuery.data ? (
          <button
            type="button"
            onClick={() => logoMutation.mutate()}
            disabled={logoMutation.isPending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {t('profile.logoSet')}
          </button>
        ) : (
          <p className="text-xs text-slate-500">{t('profile.logoHint')}</p>
        )}
      </div>
    </section>
  );
}

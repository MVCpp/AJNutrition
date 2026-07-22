import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreatePatientCommandSchema, type CreatePatientCommand } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

const FIELD_MESSAGES: Record<string, string> = {
  required: 'Este campo es obligatorio.',
  too_long: 'El texto es demasiado largo.',
  too_short: 'El texto es demasiado corto.',
  invalid_characters: 'Contiene caracteres no permitidos.',
  invalid_date: 'Use el formato AAAA-MM-DD.',
  date_in_future: 'La fecha no puede estar en el futuro.',
  date_implausible: 'La fecha no es plausible.',
  age_implausible: 'La edad resultante no es plausible.',
  invalid_email: 'El correo no es válido.',
  invalid_phone: 'El teléfono no es válido.',
};

function translate(code: string | undefined): string {
  return (code && FIELD_MESSAGES[code]) ?? 'Valor no válido.';
}

export function PatientForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CreatePatientCommand>({
    resolver: zodResolver(CreatePatientCommandSchema),
    defaultValues: { sexAtBirth: 'unspecified' },
  });

  const createMutation = useMutation({
    mutationFn: (command: CreatePatientCommand) =>
      unwrap(window.ajnutrition.patient.create(command)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      form.reset();
      onCreated();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    // Optional empty strings must not reach the schema as ''.
    const command: CreatePatientCommand = {
      ...values,
      email: values.email || undefined,
      phone: values.phone || undefined,
    };
    createMutation.mutate(command);
  });

  const { errors } = form.formState;
  const serverError = createMutation.error instanceof ApiError ? createMutation.error : null;

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="patient-form-heading">
      <h3 id="patient-form-heading" className="mb-4 text-base font-semibold">
        Nuevo paciente
      </h3>

      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {serverError.message}{' '}
          <span className="text-xs text-red-600">({serverError.detail.supportCode})</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="mb-1 block text-sm font-medium">
            Nombre(s){' '}
            <span aria-hidden="true" className="text-red-600">
              *
            </span>
          </label>
          <input
            id="firstName"
            {...form.register('firstName')}
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {errors.firstName && (
            <p id="firstName-error" className="mt-1 text-xs text-red-700">
              {translate(errors.firstName.message)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="lastName" className="mb-1 block text-sm font-medium">
            Apellido(s){' '}
            <span aria-hidden="true" className="text-red-600">
              *
            </span>
          </label>
          <input
            id="lastName"
            {...form.register('lastName')}
            aria-invalid={!!errors.lastName}
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {errors.lastName && (
            <p id="lastName-error" className="mt-1 text-xs text-red-700">
              {translate(errors.lastName.message)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium">
            Fecha de nacimiento{' '}
            <span aria-hidden="true" className="text-red-600">
              *
            </span>
          </label>
          <input
            id="dateOfBirth"
            type="date"
            {...form.register('dateOfBirth')}
            aria-invalid={!!errors.dateOfBirth}
            aria-describedby={errors.dateOfBirth ? 'dateOfBirth-error' : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {errors.dateOfBirth && (
            <p id="dateOfBirth-error" className="mt-1 text-xs text-red-700">
              {translate(errors.dateOfBirth.message)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="sexAtBirth" className="mb-1 block text-sm font-medium">
            Sexo (para cálculos clínicos)
          </label>
          <select
            id="sexAtBirth"
            {...form.register('sexAtBirth')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="unspecified">Sin especificar</option>
            <option value="female">Femenino</option>
            <option value="male">Masculino</option>
          </select>
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            {...form.register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-red-700">
              {translate(errors.email.message)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Teléfono
          </label>
          <input
            id="phone"
            type="tel"
            {...form.register('phone')}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {errors.phone && (
            <p id="phone-error" className="mt-1 text-xs text-red-700">
              {translate(errors.phone.message)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Guardando…' : 'Guardar paciente'}
        </button>
        <p className="text-xs text-slate-500">Los campos con * son obligatorios.</p>
      </div>
    </form>
  );
}

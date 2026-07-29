import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainContext } from '@ajnutrition/domain';
import {
  DeleteNoteTemplateUseCase,
  ListNoteTemplatesUseCase,
  SaveNoteTemplateUseCase,
  type NoteTemplateDeps,
} from '@ajnutrition/application';
import { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteNoteTemplateRepository } from './sqlite-note-template-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: NoteTemplateDeps;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-28T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-c000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    templates: new SqliteNoteTemplateRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
});

const command = {
  name: 'Primera consulta — adulto',
  subjective: 'Motivo de consulta: ',
  plan: 'Plan inicial: ',
};

describe('note templates', () => {
  it('saves boilerplate and lists it alphabetically', () => {
    new SaveNoteTemplateUseCase(deps).execute(command);
    new SaveNoteTemplateUseCase(deps).execute({ name: 'Control mensual', objective: 'Peso: ' });

    const list = new ListNoteTemplatesUseCase({ templates: deps.templates }).execute();
    expect(list.map((template) => template.name)).toEqual([
      'Control mensual',
      'Primera consulta — adulto',
    ]);
    expect(list[1]?.subjective).toBe('Motivo de consulta:');
  });

  it('replaces an existing template in place, keeping its id', () => {
    const created = new SaveNoteTemplateUseCase(deps).execute(command);
    const updated = new SaveNoteTemplateUseCase(deps).execute({
      templateId: created.id,
      name: created.name,
      subjective: 'Otro texto',
    });

    expect(updated.id).toBe(created.id);
    expect(new ListNoteTemplatesUseCase({ templates: deps.templates }).execute()).toHaveLength(1);
    expect(updated.plan).toBeNull();
  });

  it('refuses an empty template and a duplicate name', () => {
    new SaveNoteTemplateUseCase(deps).execute(command);
    expect(() => new SaveNoteTemplateUseCase(deps).execute({ name: 'Vacía' })).toThrowError(
      AppError,
    );
    // The unique index is case- and whitespace-insensitive.
    expect(() =>
      new SaveNoteTemplateUseCase(deps).execute({
        name: '  primera consulta — ADULTO ',
        plan: 'x',
      }),
    ).toThrowError();
  });

  it('deletes a template without touching anything clinical', () => {
    const created = new SaveNoteTemplateUseCase(deps).execute(command);
    new DeleteNoteTemplateUseCase(deps).execute({ templateId: created.id });

    expect(new ListNoteTemplatesUseCase({ templates: deps.templates }).execute()).toEqual([]);
    const actions = (
      db.prepare(`SELECT action FROM audit_events ORDER BY rowid`).all() as Array<{
        action: string;
      }>
    ).map((row) => row.action);
    expect(actions).toEqual(['note-template.save', 'note-template.delete']);
  });

  it('refuses to delete or update one that does not exist', () => {
    const ghost = '00000000-0000-4000-c000-0000000000ff';
    expect(() => new DeleteNoteTemplateUseCase(deps).execute({ templateId: ghost })).toThrowError(
      AppError,
    );
    expect(() =>
      new SaveNoteTemplateUseCase(deps).execute({ templateId: ghost, name: 'x', plan: 'y' }),
    ).toThrowError(AppError);
  });
});

import type { DomainContext } from '@ajnutrition/domain';
import {
  AppError,
  type DeleteNoteTemplateCommand,
  type NoteTemplateDto,
  type SaveNoteTemplateCommand,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { NoteTemplateRecord, NoteTemplateRepository } from '../ports/note-template-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface NoteTemplateDeps {
  uow: UnitOfWork;
  templates: NoteTemplateRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(record: NoteTemplateRecord): NoteTemplateDto {
  return {
    id: record.id,
    name: record.name,
    subjective: record.subjective,
    objective: record.objective,
    assessment: record.assessment,
    plan: record.plan,
    updatedAt: record.updatedAt,
  };
}

export class ListNoteTemplatesUseCase {
  constructor(private readonly deps: Pick<NoteTemplateDeps, 'templates'>) {}

  execute(): NoteTemplateDto[] {
    return this.deps.templates.list().map(toDto);
  }
}

export class SaveNoteTemplateUseCase {
  constructor(private readonly deps: NoteTemplateDeps) {}

  execute(command: SaveNoteTemplateCommand): NoteTemplateDto {
    const { uow, templates, audit, ctx } = this.deps;
    return uow.run(() => {
      const nowIso = ctx.now().toISOString();
      const existing =
        command.templateId === undefined ? null : templates.findById(command.templateId);
      if (command.templateId !== undefined && existing === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Plantilla no encontrada.' });
      }
      const empty = [command.subjective, command.objective, command.assessment, command.plan].every(
        (section) => section === undefined || section.trim() === '',
      );
      if (empty) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'La plantilla no puede estar vacía.',
        });
      }
      const record: NoteTemplateRecord = {
        id: existing?.id ?? ctx.newId(),
        name: command.name,
        subjective: command.subjective?.trim() || null,
        objective: command.objective?.trim() || null,
        assessment: command.assessment?.trim() || null,
        plan: command.plan?.trim() || null,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      templates.upsert(record);
      // Name only: the body is boilerplate the practitioner wrote, but audit
      // rows are exportable and there is no reason to duplicate it there.
      audit.record({
        action: 'note-template.save',
        entityType: 'note-template',
        entityId: record.id,
        result: 'success',
        metadata: { name: record.name },
      });
      return toDto(record);
    });
  }
}

export class DeleteNoteTemplateUseCase {
  constructor(private readonly deps: NoteTemplateDeps) {}

  execute(command: DeleteNoteTemplateCommand): void {
    const { uow, templates, audit } = this.deps;
    uow.run(() => {
      const existing = templates.findById(command.templateId);
      if (existing === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Plantilla no encontrada.' });
      }
      // Deleting boilerplate touches no clinical record: consultations keep
      // the text that was inserted into them.
      templates.deleteById(existing.id);
      audit.record({
        action: 'note-template.delete',
        entityType: 'note-template',
        entityId: existing.id,
        result: 'success',
        metadata: { name: existing.name },
      });
    });
  }
}

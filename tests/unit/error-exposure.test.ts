import { afterEach, describe, expect, it } from 'vitest';
import { AppError, toPublicError } from '@/lib/errors';

/**
 * O detalhe técnico do erro só pode existir em desenvolvimento.
 *
 * Em produção, expor a primeira linha de um erro do Prisma entregaria host e
 * porta do banco a qualquer visitante. Em desenvolvimento, escondê-la faz o
 * desenvolvedor perseguir "não conseguimos concluir a operação" sem pista.
 */

const original = process.env.NODE_ENV;
const setEnv = (value: string) => {
  (process.env as Record<string, string>).NODE_ENV = value;
};

afterEach(() => setEnv(original ?? 'test'));

describe('exposição de erro', () => {
  it('em produção, não vaza nada além da mensagem genérica', () => {
    setEnv('production');
    const { status, body } = toPublicError(
      new Error("Can't reach database server at `127.0.0.1:5432`"),
    );

    expect(status).toBe(500);
    expect(body.error.message).not.toContain('5432');
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });

  it('em desenvolvimento, entrega a primeira linha do erro real', () => {
    setEnv('development');
    const { body } = toPublicError(new Error("Can't reach database server at `127.0.0.1:5432`"));

    expect(String(body.error.details)).toContain('[dev]');
    expect(String(body.error.details)).toContain('database server');
  });

  it('erro já público continua com a própria mensagem, sem dica de dev', () => {
    setEnv('development');
    const { body } = toPublicError(
      new AppError('Informe o número CNJ.', { status: 400, code: 'validation_error', expose: true }),
    );

    expect(body.error.message).toBe('Informe o número CNJ.');
    expect(String(body.error.details ?? '')).not.toContain('[dev]');
  });
});

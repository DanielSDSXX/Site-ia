/**
 * Serialização para respostas JSON e para props de componentes cliente.
 *
 * Duas conversões acontecem aqui: BigInt (valor da causa) vira string, porque
 * JSON.stringify não o suporta, e Date vira string ISO, que é o que de fato
 * chega ao componente cliente. Por isso a assinatura devolve um tipo alvo
 * explícito — os DTOs do cliente declaram `string` onde o Prisma declara
 * `Date`/`bigint`, e o cast fica num único lugar auditável.
 */

function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function serialize<TOut>(value: unknown): TOut {
  return JSON.parse(JSON.stringify(value, replacer)) as TOut;
}

export function serializeProcess<TOut>(value: unknown): TOut {
  return serialize<TOut>(value);
}

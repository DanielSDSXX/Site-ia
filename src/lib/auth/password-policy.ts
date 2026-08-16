/**
 * Política de senha — módulo puro, sem dependências de servidor.
 *
 * Fica separado de `password.ts` (que importa bcrypt) para que o formulário
 * de cadastro possa validar no cliente sem arrastar bcrypt para o bundle.
 */

export interface PasswordStrength {
  ok: boolean;
  problems: string[];
}

/**
 * Foco em comprimento em vez de exigência de símbolos, seguindo a orientação
 * do NIST SP 800-63B: regras de composição empurram o usuário para senhas
 * previsíveis.
 */
export function checkPasswordStrength(password: string): PasswordStrength {
  const problems: string[] = [];
  if (password.length < 10) problems.push('Use ao menos 10 caracteres.');
  if (!/[a-zA-Z]/.test(password)) problems.push('Inclua ao menos uma letra.');
  if (!/[0-9]/.test(password)) problems.push('Inclua ao menos um número.');
  if (/^(.)\1+$/.test(password)) problems.push('Evite repetir o mesmo caractere.');

  const common = ['senha', 'password', '12345678', 'advogado', 'qwerty', 'legalmind'];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    problems.push('Evite palavras muito previsíveis.');
  }

  return { ok: problems.length === 0, problems };
}

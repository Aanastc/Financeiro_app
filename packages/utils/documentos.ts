/** Validação e máscara de CPF e telefone (Brasil). */

export const somenteDigitos = (valor: string | null | undefined) => (valor || "").replace(/\D/g, "");

/** CPF válido pelos dígitos verificadores (rejeita sequências como 111.111.111-11). */
export function cpfValido(cpf: string | null | undefined): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (base: string, pesoInicial: number) => {
    const soma = base.split("").reduce((acc, n, i) => acc + Number(n) * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(d.slice(0, 9), 10) === Number(d[9]) && digito(d.slice(0, 10), 11) === Number(d[10]);
}

/** Celular/fixo com DDD: 10 ou 11 dígitos, DDD válido (11–99). */
export function telefoneValido(telefone: string | null | undefined): boolean {
  const d = somenteDigitos(telefone);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  return d.length === 10 || d[2] === "9"; // celular com 11 dígitos começa com 9
}

export function formatarCPF(valor: string): string {
  return somenteDigitos(valor)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatarTelefone(valor: string): string {
  const v = somenteDigitos(valor).slice(0, 11);
  if (v.length > 10) return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
  if (v.length > 6) return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  if (v.length > 2) return v.replace(/^(\d\d)(\d{0,5})/, "($1) $2");
  return v;
}

/** Traduz erros do banco/Auth sobre CPF/telefone duplicados para mensagens amigáveis. */
export function mensagemDuplicidade(erro: any): string | null {
  const texto = `${erro?.message || ""} ${erro?.hint || ""} ${erro?.details || ""}`;
  if (/CPF_EM_USO|uq_usuarios_cpf/i.test(texto)) return "Já existe uma conta com este CPF.";
  if (/TELEFONE_EM_USO|uq_usuarios_telefone/i.test(texto)) return "Já existe uma conta com este telefone.";
  // No cadastro, o Auth devolve só "Database error saving new user" quando o trigger recusa
  if (/database error saving new user/i.test(texto)) return "Já existe uma conta com este CPF ou telefone.";
  if (/already registered|already been registered|user already exists/i.test(texto)) return "Já existe uma conta com este e-mail.";
  return null;
}

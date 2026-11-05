import { useState } from "react";
import { X, Sparkles, Lock } from "lucide-react";
import { toast } from "react-hot-toast";
import { authService } from "../../../../packages/services/auth.service";
import { cpfValido, formatarCPF, formatarTelefone, mensagemDuplicidade, telefoneValido } from "../../../../packages/utils/documentos";

interface DesbloquearContaModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	/** "converter": convidado → conta completa; "senha": criar a senha após confirmar o e-mail */
	modo: "converter" | "senha";
}

const CAMPO =
	"w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-slate-100 font-bold text-sm rounded-xl";
const ROTULO = "text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1 block";

/** Converte o convidado (acesso só à divisão de contas) em conta completa, sem perder nada. */
export default function DesbloquearContaModal({ isOpen, onClose, onSuccess, modo }: DesbloquearContaModalProps) {
	const [form, setForm] = useState({ nome: "", email: "", cpf: "", telefone: "", senha: "", confirmarSenha: "" });
	const [loading, setLoading] = useState(false);
	const [emailEnviado, setEmailEnviado] = useState(false);

	if (!isOpen) return null;

	const handleConverter = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.nome.trim()) return toast.error("Informe seu nome.");
		if (!cpfValido(form.cpf)) return toast.error("CPF inválido.");
		if (!telefoneValido(form.telefone)) return toast.error("Celular inválido. Use DDD + número.");
		setLoading(true);
		try {
			await authService.converterConvidado({ nome: form.nome.trim(), email: form.email, cpf: form.cpf, telefone: form.telefone });
			setEmailEnviado(true);
		} catch (err: any) {
			toast.error(mensagemDuplicidade(err) || err?.message || "Não foi possível concluir.");
		} finally {
			setLoading(false);
		}
	};

	const handleSenha = async (e: React.FormEvent) => {
		e.preventDefault();
		if (form.senha.length < 8) return toast.error("A senha deve ter no mínimo 8 caracteres.");
		if (form.senha !== form.confirmarSenha) return toast.error("As senhas não coincidem.");
		setLoading(true);
		try {
			await authService.definirSenhaAposConversao(form.senha);
			toast.success("Conta completa! Todas as funcionalidades foram liberadas.");
			onSuccess();
			onClose();
		} catch (err: any) {
			toast.error(err?.message || "Não foi possível salvar a senha.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
			<div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 relative">
				{modo === "converter" && (
					<button onClick={onClose} aria-label="Fechar" className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 p-2 rounded-full cursor-pointer">
						<X size={18} />
					</button>
				)}

				<div className="text-center mb-6">
					<div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
						{modo === "senha" ? <Lock size={22} /> : <Sparkles size={22} />}
					</div>
					<h2 className="text-xl font-black text-slate-800 dark:text-slate-100">
						{modo === "senha" ? "Crie sua senha" : "Desbloquear todas as funcionalidades"}
					</h2>
					<p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
						{modo === "senha"
							? "Último passo: defina a senha para entrar nas próximas vezes."
							: "Contas, cartões, metas, investimentos e relatórios. Nada do que você já fez é perdido."}
					</p>
				</div>

				{modo === "converter" && emailEnviado ? (
					<div className="text-center space-y-4">
						<p className="text-sm text-slate-700 dark:text-slate-200">
							Enviamos um link de confirmação para <strong>{form.email}</strong>. Abra o e-mail e confirme; em seguida você cria sua senha.
						</p>
						<button onClick={onClose} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm cursor-pointer">
							Entendi
						</button>
					</div>
				) : modo === "converter" ? (
					<form onSubmit={handleConverter} className="space-y-3.5">
						<div className="space-y-1.5">
							<label className={ROTULO}>Nome completo</label>
							<input className={CAMPO} required autoComplete="name" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
						</div>
						<div className="space-y-1.5">
							<label className={ROTULO}>E-mail</label>
							<input className={CAMPO} type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<label className={ROTULO}>CPF</label>
								<input className={CAMPO} inputMode="numeric" required placeholder="000.000.000-00" value={form.cpf} onChange={e => setForm({ ...form, cpf: formatarCPF(e.target.value) })} />
							</div>
							<div className="space-y-1.5">
								<label className={ROTULO}>Celular</label>
								<input className={CAMPO} type="tel" inputMode="tel" required placeholder="(00) 00000-0000" value={form.telefone} onChange={e => setForm({ ...form, telefone: formatarTelefone(e.target.value) })} />
							</div>
						</div>
						<button type="submit" disabled={loading} className="w-full mt-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-black text-sm cursor-pointer">
							{loading ? "ENVIANDO..." : "CONTINUAR"}
						</button>
					</form>
				) : (
					<form onSubmit={handleSenha} className="space-y-3.5">
						<div className="space-y-1.5">
							<label className={ROTULO}>Senha</label>
							<input className={CAMPO} type="password" required autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} />
						</div>
						<div className="space-y-1.5">
							<label className={ROTULO}>Confirmar senha</label>
							<input className={CAMPO} type="password" required autoComplete="new-password" value={form.confirmarSenha} onChange={e => setForm({ ...form, confirmarSenha: e.target.value })} />
						</div>
						<button type="submit" disabled={loading} className="w-full mt-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-black text-sm cursor-pointer">
							{loading ? "SALVANDO..." : "SALVAR SENHA"}
						</button>
					</form>
				)}
			</div>
		</div>
	);
}

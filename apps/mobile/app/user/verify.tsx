import { useState, useEffect } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
	SafeAreaView,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authService } from "../../../../packages/services/auth.service";
import tw from "twrnc";
import { Mail, ArrowLeft, HelpCircle, Clock } from "lucide-react-native";

export default function VerifyToken() {
	const { email } = useLocalSearchParams();
	const [token, setToken] = useState("");
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);
	const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes countdown
	const [resendTimer, setResendTimer] = useState(60); // 60 seconds resend delay
	const router = useRouter();

	// Inicia os timers
	useEffect(() => {
		const interval = setInterval(() => {
			setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
			setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	// Formata segundos em MM:SS
	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	async function handleVerify() {
		if (token.length < 6) {
			return Alert.alert("Atenção", "O código de verificação deve ter 6 dígitos.");
		}

		if (timeLeft === 0) {
			return Alert.alert("Token Expirado", "Este token expirou. Por favor, solicite o reenvio.");
		}

		setLoading(true);
		try {
			await authService.verifyOtp(email as string, token);
			Alert.alert("Sucesso! 🎉", "Conta ativada com sucesso. Bem-vindo(a)!", [
				{ text: "Entrar no App", onPress: () => router.replace("/home") },
			]);
		} catch (error: any) {
			Alert.alert("Erro", "Código inválido ou expirado. Verifique sua caixa de entrada.");
		} finally {
			setLoading(false);
		}
	}

	async function handleResend() {
		if (resendTimer > 0 || resending) return;

		setResending(true);
		try {
			await authService.resendOtp(email as string);
			Alert.alert("Sucesso! ✉️", "Um novo código foi enviado para o seu e-mail.");
			// Reinicia os timers
			setResendTimer(60);
			setTimeLeft(3600);
		} catch (error: any) {
			Alert.alert("Erro", error.message || "Não foi possível reenviar o código.");
		} finally {
			setResending(false);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-[#FCF8F8]`}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={tw`flex-1`}>
				<ScrollView
					contentContainerStyle={tw`flex-grow justify-center px-8 py-10`}
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled">
					
					{/* Header Icon */}
					<View style={tw`items-center mb-8`}>
						<View style={tw`w-24 h-24 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm relative`}>
							<Mail size={40} color="#4CAF50" />
							<View style={tw`absolute -top-1 -right-1 bg-[#5D4037] px-2 py-0.5 rounded-full`}>
								<Text style={tw`text-white text-[9px] font-black`}>TOKEN</Text>
							</View>
						</View>
					</View>

					{/* Title and Wording */}
					<View style={tw`items-center mb-6`}>
						<Text style={tw`text-3xl font-black text-[#5D4037] text-center`}>
							Seu código de acesso 🚀
						</Text>
						<Text style={tw`text-gray-400 text-center mt-2 font-medium px-4`}>
							Use o token enviado para confirmar seu e-mail e começar a poupar.
						</Text>
					</View>

					{/* Email Card */}
					<View style={tw`bg-white border border-gray-100 p-4 rounded-3xl items-center mb-6 shadow-sm`}>
						<Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1`}>
							E-MAIL CADASTRADO
						</Text>
						<Text style={tw`text-[#5D4037] font-black text-center break-all`}>
							{email}
						</Text>
					</View>

					{/* Input Token */}
					<View style={tw`mb-4`}>
						<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs uppercase tracking-wider`}>
							Código de Verificação
						</Text>
						<TextInput
							placeholder="000000"
							placeholderTextColor="#d1d5db"
							keyboardType="number-pad"
							maxLength={6}
							value={token}
							onChangeText={(text) => setToken(text.replace(/\D/g, ""))}
							autoFocus={true}
							style={tw`bg-white border-2 border-dashed border-gray-200 p-5 rounded-3xl text-center text-4xl font-bold tracking-widest text-[#4CAF50] mb-3 shadow-sm`}
						/>
						
						{/* Token Expiration Timer */}
						<View style={tw`flex-row items-center justify-center mb-6`}>
							<Clock size={14} color="#5D4037" style={tw`mr-1.5 opacity-70`} />
							{timeLeft > 0 ? (
								<Text style={tw`text-xs font-bold text-[#5D4037] opacity-70`}>
									O token expira em:{" "}
									<Text style={tw`font-extrabold text-[#4CAF50]`}>
										{formatTime(timeLeft)}
									</Text>
								</Text>
							) : (
								<Text style={tw`text-xs font-extrabold text-red-500`}>
									O token expirou!
								</Text>
							)}
						</View>
					</View>

					{/* Spam Warning Box */}
					<View style={tw`bg-amber-50/70 border border-amber-100 p-4 rounded-3xl flex-row items-start mb-6`}>
						<HelpCircle size={20} color="#b45309" style={tw`mr-3 mt-0.5`} />
						<View style={tw`flex-1`}>
							<Text style={tw`text-amber-800 font-bold text-xs mb-1`}>
								Não recebeu o código?
							</Text>
							<Text style={tw`text-[#5D4037] text-xs leading-4`}>
								Verifique sua caixa de <Text style={tw`font-bold`}>Spam ou Lixo Eletrônico</Text>. Às vezes o e-mail de ativação pode ser classificado incorretamente.
							</Text>
						</View>
					</View>

					{/* Submit Button */}
					<TouchableOpacity
						onPress={handleVerify}
						disabled={loading || timeLeft === 0}
						style={tw`bg-[#5D4037] p-5 rounded-3xl shadow-lg shadow-gray-200 mb-6 disabled:bg-[#8d7973]`}>
						{loading ? (
							<ActivityIndicator color="white" />
						) : (
							<Text style={tw`text-white text-center font-black text-lg`}>
								CONFIRMAR E ENTRAR
							</Text>
						)}
					</TouchableOpacity>

					{/* Resend button */}
					<View style={tw`items-center mb-6`}>
						{resendTimer > 0 ? (
							<Text style={tw`text-center text-gray-400 font-bold text-sm`}>
								Reenviar código em {resendTimer}s
							</Text>
						) : (
							<TouchableOpacity onPress={handleResend} disabled={resending}>
								<Text style={tw`text-center text-[#4CAF50] font-black text-sm`}>
									{resending ? "Reenviando..." : "Reenviar Código"}
								</Text>
							</TouchableOpacity>
						)}
					</View>

					<TouchableOpacity
						onPress={() => router.back()}
						style={tw`flex-row items-center justify-center mt-2`}>
						<ArrowLeft size={16} color="#9ca3af" style={tw`mr-1.5`} />
						<Text style={tw`text-gray-400 font-bold text-xs uppercase tracking-wider`}>
							Voltar para o Cadastro
						</Text>
					</TouchableOpacity>

				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

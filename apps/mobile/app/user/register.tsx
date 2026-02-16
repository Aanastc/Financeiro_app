import React, { useState } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Alert,
	SafeAreaView,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { authService } from "../../../../packages/services/auth.service";
import tw from "twrnc";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react-native";

export default function Register() {
	const [nome, setNome] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const router = useRouter();

	async function handleRegister() {
		if (!email || !password || !nome || !confirmPassword) {
			return Alert.alert("Atenção", "Preencha todos os campos.");
		}
		if (password.length < 8) {
			return Alert.alert(
				"Senha Curta",
				"A senha deve ter no mínimo 8 caracteres.",
			);
		}
		if (password !== confirmPassword) {
			return Alert.alert("Erro", "As senhas não coincidem.");
		}

		setLoading(true);
		try {
			await authService.register(email, password, nome);
			router.push({ pathname: "/user/verify", params: { email } });
		} catch (error: any) {
			Alert.alert("Erro", error.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-[#FCF8F8]`}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={tw`flex-1`}>
				<ScrollView
					contentContainerStyle={tw`flex-grow justify-center px-8 py-10`}>
					<View style={tw`mb-10 items-center`}>
						<Text style={tw`text-4xl font-black text-[#5D4037]`}>Cadastro</Text>
						<Text style={tw`text-gray-400 text-lg mt-2`}>
							Controle suas finanças 💸
						</Text>
					</View>

					<View style={tw`gap-y-4`}>
						<View>
							<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs`}>
								NOME
							</Text>
							<View
								style={tw`flex-row items-center bg-white border border-gray-100 p-4 rounded-3xl shadow-sm`}>
								<User size={20} color="#5D4037" style={tw`mr-3`} />
								<TextInput
									placeholder="Nome Completo"
									value={nome}
									onChangeText={setNome}
									style={tw`flex-1 text-[#5D4037] font-medium`}
								/>
							</View>
						</View>

						<View>
							<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs`}>
								E-MAIL
							</Text>
							<View
								style={tw`flex-row items-center bg-white border border-gray-100 p-4 rounded-3xl shadow-sm`}>
								<Mail size={20} color="#5D4037" style={tw`mr-3`} />
								<TextInput
									placeholder="seu@email.com"
									value={email}
									onChangeText={setEmail}
									autoCapitalize="none"
									keyboardType="email-address"
									style={tw`flex-1 text-[#5D4037] font-medium`}
								/>
							</View>
						</View>

						<View>
							<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs`}>
								SENHA
							</Text>
							<View
								style={tw`flex-row items-center bg-white border border-gray-100 p-4 rounded-3xl shadow-sm`}>
								<Lock size={20} color="#5D4037" style={tw`mr-3`} />
								<TextInput
									placeholder="Mínimo 8 dígitos"
									value={password}
									onChangeText={setPassword}
									secureTextEntry={!showPassword}
									style={tw`flex-1 text-[#5D4037] font-medium`}
								/>
								<TouchableOpacity
									onPress={() => setShowPassword(!showPassword)}>
									{showPassword ? (
										<EyeOff size={20} color="#9ca3af" />
									) : (
										<Eye size={20} color="#9ca3af" />
									)}
								</TouchableOpacity>
							</View>
							<Text style={tw`text-[10px] text-gray-400 mt-1 ml-2 italic`}>
								Obrigatório 8 caracteres.
							</Text>
						</View>

						<View>
							<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs`}>
								CONFIRMAR SENHA
							</Text>
							<View
								style={tw`flex-row items-center bg-white border border-gray-100 p-4 rounded-3xl shadow-sm`}>
								<Lock size={20} color="#5D4037" style={tw`mr-3`} />
								<TextInput
									placeholder="Repita a senha"
									value={confirmPassword}
									onChangeText={setConfirmPassword}
									secureTextEntry={!showPassword}
									style={tw`flex-1 text-[#5D4037] font-medium`}
								/>
							</View>
							{confirmPassword !== "" && password !== confirmPassword && (
								<Text style={tw`text-[10px] text-red-500 mt-1 ml-2 font-bold`}>
									As senhas não coincidem!
								</Text>
							)}
						</View>
					</View>

					<TouchableOpacity
						onPress={handleRegister}
						disabled={loading}
						style={tw`bg-[#4CAF50] p-5 rounded-3xl mt-8 shadow-lg shadow-green-100`}>
						{loading ? (
							<ActivityIndicator color="white" />
						) : (
							<Text style={tw`text-white text-center font-black text-lg`}>
								CADASTRAR
							</Text>
						)}
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => router.push("/user/login")}
						style={tw`mt-8`}>
						<Text style={tw`text-center text-gray-500 font-medium`}>
							Já possui conta?{" "}
							<Text style={tw`text-[#4CAF50] font-black`}>Entrar</Text>
						</Text>
					</TouchableOpacity>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

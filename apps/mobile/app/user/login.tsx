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
import { Mail, Lock, Eye, EyeOff } from "lucide-react-native";

export default function Login() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const router = useRouter();

	async function handleLogin() {
		if (!email || !password)
			return Alert.alert("Atenção", "Preencha todos os campos.");
		setLoading(true);

		try {
			await authService.login(email, password);
			router.replace("/home");
		} catch (error: any) {
			Alert.alert("Erro ao entrar", "E-mail ou senha inválidos.");
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
						<Text style={tw`text-4xl font-black text-[#5D4037]`}>
							Bem-vinda
						</Text>
						<Text style={tw`text-gray-400 text-lg mt-2`}>
							Sentimos sua falta! 😊
						</Text>
					</View>

					<View style={tw`gap-y-5`}>
						{/* Campo E-mail */}
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

						{/* Campo Senha */}
						<View>
							<Text style={tw`text-[#5D4037] font-bold mb-2 ml-2 text-xs`}>
								SENHA
							</Text>
							<View
								style={tw`flex-row items-center bg-white border border-gray-100 p-4 rounded-3xl shadow-sm`}>
								<Lock size={20} color="#5D4037" style={tw`mr-3`} />
								<TextInput
									placeholder="Sua senha secreta"
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
						</View>
					</View>

					<TouchableOpacity
						onPress={handleLogin}
						disabled={loading}
						style={tw`bg-[#4CAF50] p-5 rounded-3xl mt-10 shadow-lg shadow-green-100`}>
						{loading ? (
							<ActivityIndicator color="white" />
						) : (
							<Text style={tw`text-white text-center font-black text-lg`}>
								ENTRAR
							</Text>
						)}
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => router.push("/user/register")}
						style={tw`mt-8`}>
						<Text style={tw`text-center text-gray-500 font-medium`}>
							Ainda não tem conta?{" "}
							<Text style={tw`text-[#4CAF50] font-black`}>Cadastre-se</Text>
						</Text>
					</TouchableOpacity>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

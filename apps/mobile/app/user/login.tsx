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

export default function Login() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleLogin() {
		if (!email || !password)
			return Alert.alert("Atenção", "Preencha todos os campos.");
		setLoading(true);

		try {
			await authService.login(email, password);
			router.replace("/home"); // Redireciona para a Home na raiz da pasta app
		} catch (error: any) {
			Alert.alert("Erro ao entrar", "E-mail ou senha inválidos.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-white`}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={tw`flex-1`}>
				<ScrollView
					contentContainerStyle={tw`flex-grow justify-center px-8 py-10`}>
					<View style={tw`mb-10`}>
						<Text style={tw`text-4xl font-bold text-red-900`}>Login</Text>
						<Text style={tw`text-gray-500 text-lg mt-2`}>
							Bem-vinda de volta! 😊
						</Text>
					</View>

					<View style={tw`gap-y-4`}>
						<TextInput
							placeholder="E-mail"
							value={email}
							onChangeText={setEmail}
							autoCapitalize="none"
							style={tw`bg-gray-50 border border-gray-200 p-4 rounded-2xl`}
						/>
						<TextInput
							placeholder="Senha"
							value={password}
							onChangeText={setPassword}
							secureTextEntry
							style={tw`bg-gray-50 border border-gray-200 p-4 rounded-2xl`}
						/>
					</View>

					<TouchableOpacity
						onPress={handleLogin}
						disabled={loading}
						style={tw`${loading ? "bg-gray-300" : "bg-red-800"} p-5 rounded-2xl mt-8`}>
						{loading ? (
							<ActivityIndicator color="white" />
						) : (
							<Text style={tw`text-white text-center font-bold text-lg`}>
								Entrar
							</Text>
						)}
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => router.push("/user/register")}
						style={tw`mt-8`}>
						<Text style={tw`text-center text-gray-500`}>
							Não tem conta?{" "}
							<Text style={tw`text-red-800 font-bold`}>Cadastre-se</Text>
						</Text>
					</TouchableOpacity>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

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
// Subindo três níveis para alcançar a pasta packages na raiz do monorepo
import { authService } from "../../../../packages/services/auth.service";
import tw from "twrnc";

export default function Register() {
	const [nome, setNome] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleRegister() {
		if (!email || !password || !nome) {
			return Alert.alert("Atenção", "Por favor, preencha todos os campos.");
		}

		if (password.length < 6) {
			return Alert.alert(
				"Senha curta",
				"A senha deve ter pelo menos 6 caracteres.",
			);
		}

		setLoading(true);

		try {
			await authService.register(email, password, nome);

			Alert.alert(
				"Conta criada! 🎉",
				"Verifique seu e-mail para confirmar a conta.",
				[{ text: "OK", onPress: () => router.replace("/user/login") }],
			);
		} catch (error: any) {
			Alert.alert("Erro ao cadastrar", error.message);
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
					contentContainerStyle={tw`flex-grow justify-center px-8 py-10`}
					keyboardShouldPersistTaps="handled">
					<View style={tw`mb-10`}>
						<Text style={tw`text-4xl font-bold text-green-900`}>Cadastro</Text>
						<Text style={tw`text-gray-500 text-lg mt-2`}>
							Crie sua conta e assuma o controle 💸
						</Text>
					</View>

					<View style={tw`gap-y-4`}>
						<View>
							<Text style={tw`text-gray-700 font-medium mb-2 ml-1`}>
								Nome Completo
							</Text>
							<TextInput
								placeholder="Ex: Ana Letícia"
								value={nome}
								onChangeText={setNome}
								style={tw`bg-gray-50 border border-gray-200 p-4 rounded-2xl text-gray-800`}
							/>
						</View>

						<View>
							<Text style={tw`text-gray-700 font-medium mb-2 ml-1`}>
								E-mail
							</Text>
							<TextInput
								placeholder="exemplo@email.com"
								value={email}
								onChangeText={setEmail}
								autoCapitalize="none"
								keyboardType="email-address"
								style={tw`bg-gray-50 border border-gray-200 p-4 rounded-2xl text-gray-800`}
							/>
						</View>

						<View style={tw`mb-4`}>
							<Text style={tw`text-gray-700 font-medium mb-2 ml-1`}>Senha</Text>
							<TextInput
								placeholder="Mínimo 6 caracteres"
								value={password}
								onChangeText={setPassword}
								secureTextEntry
								style={tw`bg-gray-50 border border-gray-200 p-4 rounded-2xl text-gray-800`}
							/>
						</View>
					</View>

					<TouchableOpacity
						onPress={handleRegister}
						disabled={loading}
						style={tw`${loading ? "bg-gray-300" : "bg-green-700"} p-5 rounded-2xl mt-6`}>
						{loading ? (
							<ActivityIndicator color="white" />
						) : (
							<Text style={tw`text-white text-center font-bold text-lg`}>
								Criar conta
							</Text>
						)}
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => router.push("/user/login")}
						style={tw`mt-8`}>
						<Text style={tw`text-center text-gray-500`}>
							Já possui uma conta?{" "}
							<Text style={tw`text-green-700 font-bold`}>Entrar</Text>
						</Text>
					</TouchableOpacity>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

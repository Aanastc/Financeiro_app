import { Text, View, SafeAreaView, StatusBar } from "react-native";
import tw from "twrnc";

export default function Home() {
	return (
		<SafeAreaView style={tw`flex-1 bg-white`}>
			<StatusBar barStyle="dark-content" />
			<View style={tw`flex-1 px-8 justify-center`}>
				<Text style={tw`text-3xl font-bold text-red-800 mb-2`}>
					Bem-vinda 💖
				</Text>
				<Text style={tw`text-lg text-green-700`}>
					Seu controle financeiro começa aqui.
				</Text>
			</View>
		</SafeAreaView>
	);
}

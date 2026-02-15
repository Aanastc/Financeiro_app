import React from "react";
import { View, Text, TouchableOpacity, SafeAreaView } from "react-native";
import { useRouter, usePathname } from "expo-router";
import tw from "twrnc";

export function NavBar() {
	const router = useRouter();
	const pathname = usePathname();

	// Verifica se estamos na Home
	const isHome = pathname === "/home" || pathname === "/";

	return (
		<SafeAreaView style={tw`bg-white border-b border-gray-100`}>
			<View style={tw`px-6 py-4 flex-row justify-between items-center`}>
				{/* Lado Esquerdo: Nome do App / Logo */}
				<TouchableOpacity onPress={() => router.push("/home")}>
					<Text style={tw`text-xl font-bold text-red-900`}>
						Fluxo<Text style={tw`text-green-700`}>Me</Text>
					</Text>
				</TouchableOpacity>

				{/* Lado Direito: Botões Dinâmicos */}
				<View style={tw`flex-row gap-x-3`}>
					{isHome ? (
						<>
							<TouchableOpacity
								onPress={() => router.push("/finance/entradas")}
								style={tw`bg-green-100 px-3 py-2 rounded-lg`}>
								<Text style={tw`text-green-800 font-bold text-xs`}>
									+ Entrada
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() => router.push("/finance/gastos")}
								style={tw`bg-red-100 px-3 py-2 rounded-lg`}>
								<Text style={tw`text-red-800 font-bold text-xs`}>+ Gasto</Text>
							</TouchableOpacity>
						</>
					) : (
						<TouchableOpacity
							onPress={() => router.push("/home")}
							style={tw`bg-gray-100 px-4 py-2 rounded-lg`}>
							<Text style={tw`text-gray-700 font-bold text-xs`}>
								🏠 Voltar Home
							</Text>
						</TouchableOpacity>
					)}
				</View>
			</View>
		</SafeAreaView>
	);
}

import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Icon, Notice } from "@/components/ui";
import { colors } from "@/constants/theme";
import { authErrorMessage } from "@/stores/auth-state";
import { useAuthStore } from "@/stores/useAuthStore";

export default function LoginScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const busy = useAuthStore((state) => state.busy);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function login() {
    setError("");
    try {
      await signIn(email, password);
      setPassword("");
    } catch (reason) {
      setError(authErrorMessage(reason));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow justify-center px-6 py-10">
          <View className="w-full max-w-content gap-5 self-center rounded-3xl border border-line bg-surface p-6">
            <Icon name="cube-outline" color={colors.primary} size={36} />
            <Text className="text-[28px] font-bold text-ink">SGE Despacho</Text>
            <Text className="text-[15px] text-muted">Inicia sesión con tu cuenta de trabajo.</Text>
            <View className="gap-2">
              <Text className="font-bold text-ink">Correo electrónico</Text>
              <TextInput
                accessibilityLabel="Correo electrónico"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                keyboardType="email-address"
                editable={!busy}
                value={email}
                onChangeText={setEmail}
                placeholder="correo@empresa.com"
                placeholderTextColor={colors.muted}
                className="min-h-[54px] rounded-[17px] border border-line bg-background px-4 text-[16px] text-ink"
              />
            </View>
            <View className="gap-2">
              <Text className="font-bold text-ink">Contraseña</Text>
              <TextInput
                accessibilityLabel="Contraseña"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                secureTextEntry
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void login()}
                returnKeyType="go"
                className="min-h-[54px] rounded-[17px] border border-line bg-background px-4 text-[16px] text-ink"
              />
            </View>
            {error ? <Notice message={error} /> : null}
            <Button title="Iniciar sesión" icon="log-in-outline" loading={busy} onPress={() => void login()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

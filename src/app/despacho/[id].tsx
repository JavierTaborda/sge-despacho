import { useLocalSearchParams } from "expo-router";

import DispatchScreen from "@/features/despacho/screens/DispatchScreen";

export default function DispatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DispatchScreen key={id} id={id} />;
}

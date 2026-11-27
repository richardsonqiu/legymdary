import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Icon, type IconName } from "./Icons";
import { Text } from "./Text";

type TabBarProps = BottomTabBarProps;

const ICONS: Record<string, IconName> = { index: "home", train: "train", food: "food", progress: "progress", insights: "insights" };

/** Bottom nav like the web: line icons, the active one on a Citron pill. */
export function TabBar({ state, descriptors, navigateToTab }: TabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: t.page,
        borderTopWidth: 1,
        borderTopColor: t.border,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 8,
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const { options } = descriptors[route.key];
        const label = typeof options.title === "string" ? options.title : route.name;
        const onPress = () => {
          if (!focused) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            style={{ flex: 1, alignItems: "center", gap: 4, minHeight: 48 }}
          >
            <View
              style={{
                width: 48,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? t.accent : "transparent",
              }}
            >
              <Icon name={ICONS[route.name] ?? "home"} color={focused ? t.onAccent : t.muted} />
            </View>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: focused ? "600" : "500", color: focused ? t.text : t.muted }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

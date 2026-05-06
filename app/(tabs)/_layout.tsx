import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { Role } from '@/lib/types';

/** Vrátí undefined (zobrazit tab) nebo null (skrýt tab) podle role */
function tabHref(allowed: Role[], role: Role | undefined): null | undefined {
  if (!role) return null;
  return allowed.includes(role) ? undefined : null;
}

export default function TabsLayout() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const role = profile?.role;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: { backgroundColor: colors.tabBarBg, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {/* Přehled – dispatcher, admin */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Přehled',
          href: tabHref(['dispatcher', 'admin'], role),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />

      {/* KPI – management, admin */}
      <Tabs.Screen
        name="kpi"
        options={{
          title: 'KPI',
          href: tabHref(['management', 'admin'], role),
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />

      {/* Mé stanoviště – operátor, dispatcher */}
      <Tabs.Screen
        name="my-station"
        options={{
          title: 'Mé stanoviště',
          href: tabHref(['operator', 'dispatcher'], role),
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" size={size} color={color} />,
        }}
      />

      {/* Produkty – TPV */}
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produkty',
          href: tabHref(['tpv'], role),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />

      {/* Zakázky – všechny role */}
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Zakázky',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />

      {/* Notifikace – všechny role */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifikace',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />

      {/* Správa – pouze admin */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Správa',
          href: tabHref(['admin'], role),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />

      {/* Profil – všechny role */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

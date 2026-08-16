import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const reminderKey = "recco-daily-reminder-id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getReminderEnabled() {
  return Boolean(await AsyncStorage.getItem(reminderKey));
}

export async function enableDailyReccoReminder() {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("recco-reminders", {
      name: "Recco reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: "#44DDC1",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return false;
  const existing = await AsyncStorage.getItem(reminderKey);
  if (existing) await Notifications.cancelScheduledNotificationAsync(existing).catch(() => undefined);
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your next Recco is waiting",
      body: "Pick up where you left off, or let your taste map find something new.",
      data: { screen: "Home" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(reminderKey, identifier);
  return true;
}

export async function disableDailyReccoReminder() {
  const identifier = await AsyncStorage.getItem(reminderKey);
  if (identifier) await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await AsyncStorage.removeItem(reminderKey);
}

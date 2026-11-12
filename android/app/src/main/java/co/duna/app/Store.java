package co.duna.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/** Configuración del dispositivo para notificaciones nativas. */
final class Store {
    static SharedPreferences p(Context c) { return c.getSharedPreferences("duna_native", Context.MODE_PRIVATE); }

    static boolean registered(Context c) { return p(c).getString("topic", null) != null && p(c).getString("key", null) != null; }
    static String url(Context c) { return p(c).getString("url", null); }
    static String apikey(Context c) { return p(c).getString("apikey", null); }
    static String topic(Context c) { return p(c).getString("topic", null); }
    static String uid(Context c) { return p(c).getString("uid", null); }
    static String key(Context c) { return Sec.unwrap(p(c).getString("key", null)); }
    static boolean preview(Context c) { return p(c).getBoolean("preview", true); }
    static long lastId(Context c) { return p(c).getLong("last_id", 0); }

    static void save(Context c, String url, String apikey, String topic, String key, String uid) {
        p(c).edit().putString("url", url).putString("apikey", apikey).putString("topic", topic)
                .putString("key", Sec.wrap(key)).putString("uid", uid).apply();
    }
    static boolean fcmMode(Context c) { return BuildConfig.HAS_FCM && p(c).getBoolean("fcm_ready", false) && p(c).getString("fcm_token", null) != null; }
    static void clear(Context c) { p(c).edit().clear().apply(); }

    static void setChatKeys(Context c, JSONObject keys, boolean preview) {
        p(c).edit().putString("chat_keys", Sec.wrap(keys.toString())).putBoolean("preview", preview).apply();
    }
    static String chatKey(Context c, String chat) {
        try {
            String raw = Sec.unwrap(p(c).getString("chat_keys", null));
            if (raw == null) return null;
            JSONObject o = new JSONObject(raw);
            return o.optString(chat, null);
        } catch (Exception e) { return null; }
    }

    /** Evita mostrar dos veces la misma notificación (llega en vivo y también por la cola). */
    static synchronized boolean markSeen(Context c, long id) {
        if (id <= 0) return true;
        SharedPreferences sp = p(c);
        String seen = sp.getString("seen", "");
        String tok = "," + id + ",";
        if (("," + seen + ",").contains(tok)) return false;
        String next = seen.isEmpty() ? String.valueOf(id) : seen + "," + id;
        String[] parts = next.split(",");
        if (parts.length > 80) next = android.text.TextUtils.join(",", java.util.Arrays.copyOfRange(parts, parts.length - 80, parts.length));
        SharedPreferences.Editor e = sp.edit().putString("seen", next);
        if (id > sp.getLong("last_id", 0)) e.putLong("last_id", id);
        e.apply();
        return true;
    }
}

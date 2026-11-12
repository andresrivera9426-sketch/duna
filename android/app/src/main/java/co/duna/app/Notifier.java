package co.duna.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.app.Notification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Descifra y muestra las notificaciones de DUNA (mensajes y llamadas). */
final class Notifier {
    static final String CH_MSG = "duna_msgs";
    static final String CH_CALL = "duna_calls";
    static final String CH_SERVICE = "duna_service";
    static final String KEY_REPLY = "duna_reply_text";
    // historial por chat: {remitente, texto, hora, "1" si es mío}
    private static final Map<String, List<String[]>> history = new HashMap<>();
    private static final Map<String, String[]> meta = new HashMap<>(); // chat -> {título, tipo}
    private static final Map<String, String> KIND = new HashMap<>();
    static {
        KIND.put("image", "📷 Foto"); KIND.put("video", "🎬 Video"); KIND.put("audio", "🎵 Audio"); KIND.put("voice", "🎤 Nota de voz");
        KIND.put("document", "📄 Documento"); KIND.put("location", "📍 Ubicación"); KIND.put("contact", "👤 Contacto");
        KIND.put("poll", "📊 Encuesta"); KIND.put("sticker", "✨ Sticker"); KIND.put("gif", "GIF");
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel m = new NotificationChannel(CH_MSG, "Mensajes", NotificationManager.IMPORTANCE_HIGH);
        m.setDescription("Mensajes nuevos de tus chats y grupos");
        m.enableVibration(true); m.setVibrationPattern(new long[]{0, 250, 150, 250}); m.setShowBadge(true);
        m.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        m.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE); m.enableLights(true);
        nm.createNotificationChannel(m);
        NotificationChannel call = new NotificationChannel(CH_CALL, "Llamadas", NotificationManager.IMPORTANCE_HIGH);
        call.setDescription("Llamadas y videollamadas entrantes");
        call.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        call.enableVibration(true); call.setVibrationPattern(new long[]{0, 800, 600, 800, 600, 800});
        nm.createNotificationChannel(call);
        NotificationChannel s = new NotificationChannel(CH_SERVICE, "Conexión en segundo plano", NotificationManager.IMPORTANCE_MIN);
        s.setDescription("Mantiene DUNA conectada para recibir mensajes con la app cerrada. Puedes ocultar este aviso.");
        s.setShowBadge(false);
        nm.createNotificationChannel(s);
    }

    static PendingIntent openIntent(Context c, String chat, String call, int req) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.setAction("co.duna.app.OPEN_" + req);
        if (chat != null) i.putExtra("duna_chat", chat);
        if (call != null) i.putExtra("duna_call", call);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int idFor(String chat) { return chat == null ? 7 : (chat.hashCode() & 0x3fffffff) + 100; }

    /** Entrada: id de la cola + {v, iv, ct} cifrado con la clave del dispositivo. */
    static void handle(Context c, long id, String iv, String ct) {
        String key = Store.key(c);
        if (key == null || iv == null || ct == null) return;
        if (!Store.markSeen(c, id)) return;
        JSONObject d;
        try { d = new JSONObject(Sec.aesOpen(key, iv, ct)); } catch (Exception e) { return; }
        String uid = Store.uid(c);
        if (uid != null && d.has("uid") && !uid.equals(d.optString("uid"))) return;
        long at = d.optLong("at", 0);
        boolean stale = at > 0 && System.currentTimeMillis() / 1000 - at > 2 * 86400;
        if (stale) return;
        if (MainActivity.visible) return; // con DUNA en pantalla, la app ya muestra el mensaje
        channels(c);
        if ("call".equals(d.optString("t"))) showCall(c, d, at);
        else showMsg(c, d);
    }

    private static void showMsg(Context c, JSONObject d) {
        String chat = d.optString("chat", null);
        String title = d.optString("title", "DUNA");
        String from = d.optString("from", title);
        String kind = d.optString("kind", "text");
        boolean group = !"direct".equals(d.optString("ct", "direct"));
        String text = d.isNull("body") ? null : d.optString("body", null);
        boolean preview = Store.preview(c);
        if (text == null && d.has("enc") && !d.isNull("enc") && preview && chat != null) {
            String ck = Store.chatKey(c, chat);
            if (ck != null) {
                try {
                    JSONObject e = d.getJSONObject("enc");
                    JSONObject p = new JSONObject(Sec.aesOpen(ck, e.getString("iv"), e.getString("ct")));
                    text = p.optString("b", null);
                } catch (Exception ignored) { text = null; }
            }
        }
        String body;
        if (d.optBoolean("vo", false)) body = "① " + ("image".equals(kind) ? "Foto" : "Video") + " de una vista";
        else if (KIND.containsKey(kind)) body = KIND.get(kind) + (text != null && !text.isEmpty() ? " " + text : "");
        else body = text != null && !text.isEmpty() ? text : (d.has("enc") && !d.isNull("enc") ? "🔒 Mensaje nuevo" : "Mensaje nuevo");
        if (!preview) body = "Mensaje nuevo";
        if (body.length() > 240) body = body.substring(0, 240) + "…";

        if (d.optBoolean("big", false) && text == null) body = "Mensaje nuevo";
        addHistory(chat, from, body, false);
        meta.put(chat, new String[]{title, d.optString("ct", "direct")});
        post(c, chat, false);
    }

    private static void addHistory(String chat, String from, String body, boolean mine) {
        List<String[]> h = history.get(chat);
        if (h == null) { h = new ArrayList<>(); history.put(chat, h); }
        h.add(new String[]{from, body, String.valueOf(System.currentTimeMillis()), mine ? "1" : "0"});
        while (h.size() > 8) h.remove(0);
    }

    /** Publica (o actualiza en silencio) la notificación de un chat: estilo conversación + Responder + Marcar como leído. */
    static void post(Context c, String chat, boolean silent) {
        List<String[]> h = history.get(chat);
        String[] mt = meta.get(chat);
        if (h == null || h.isEmpty() || mt == null) return;
        String title = mt[0]; boolean group = !"direct".equals(mt[1]);
        String last = h.get(h.size() - 1)[1];
        Person me = new Person.Builder().setName("Tú").build();
        NotificationCompat.MessagingStyle st = new NotificationCompat.MessagingStyle(me);
        if (group) { st.setConversationTitle(title); st.setGroupConversation(true); }
        int unread = 0;
        for (String[] x : h) {
            boolean mine = "1".equals(x[3]);
            if (!mine) unread++;
            st.addMessage(x[1], Long.parseLong(x[2]), mine ? null : new Person.Builder().setName(x[0]).build());
        }
        int nid = idFor(chat);
        RemoteInput ri = new RemoteInput.Builder(KEY_REPLY).setLabel("Escribe un mensaje").build();
        PendingIntent replyPi = PendingIntent.getBroadcast(c, nid, new Intent(c, ReplyReceiver.class).setAction("co.duna.app.REPLY")
                .putExtra("chat", chat).putExtra("ct", mt[1]).putExtra("title", title), PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
        PendingIntent readPi = PendingIntent.getBroadcast(c, nid + 1, new Intent(c, ReplyReceiver.class).setAction("co.duna.app.READ")
                .putExtra("chat", chat), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Action reply = new NotificationCompat.Action.Builder(0, "Responder", replyPi)
                .addRemoteInput(ri).setAllowGeneratedReplies(true)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY).setShowsUserInterface(false).build();
        NotificationCompat.Action read = new NotificationCompat.Action.Builder(0, "Marcar como leído", readPi)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ).setShowsUserInterface(false).build();
        boolean canReply = Store.reply(c) != null && !"duna-test".equals(chat);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_MSG)
                .setSmallIcon(R.drawable.ic_stat_duna)
                .setColor(0xFF6D4BFF)
                .setContentTitle(title)
                .setContentText(last)
                .setStyle(st)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOnlyAlertOnce(silent)
                .setSilent(silent)
                .setNumber(unread)
                .setContentIntent(openIntent(c, chat, null, nid))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setGroup("duna_msgs");
        // Pantalla de bloqueo: con "Mostrar vista previa" se ve el texto (como WhatsApp); sin ella, solo "Mensaje nuevo".
        boolean pv = Store.preview(c);
        b.setVisibility(pv ? NotificationCompat.VISIBILITY_PUBLIC : NotificationCompat.VISIBILITY_PRIVATE);
        if (!pv) b.setPublicVersion(new NotificationCompat.Builder(c, CH_MSG).setSmallIcon(R.drawable.ic_stat_duna)
                .setColor(0xFF6D4BFF).setContentTitle("DUNA").setContentText("Mensaje nuevo").build());
        b.setDefaults(NotificationCompat.DEFAULT_ALL);
        if (canReply) b.addAction(reply);
        if (canReply) b.addAction(read);
        try { NotificationManagerCompat.from(c).notify(nid, b.build()); } catch (SecurityException ignored) { }
    }

    /** Tras responder desde la notificación: se añade "Tú: …" y se actualiza sin sonar. */
    static void ensureMeta(String chat, String title, String ct) { if (!meta.containsKey(chat)) meta.put(chat, new String[]{title == null ? "DUNA" : title, ct == null ? "direct" : ct}); }
    static void addMyReply(Context c, String chat, String text) { addHistory(chat, "Tú", text, true); post(c, chat, true); }
    static void replyFailed(Context c, String chat, String why) { addHistory(chat, "DUNA", "⚠️ No se envió: " + why, false); post(c, chat, true); }

    private static void showCall(Context c, JSONObject d, long at) {
        if (at > 0 && System.currentTimeMillis() / 1000 - at > 50) return; // ya no está sonando
        String chat = d.optString("chat", null), call = d.optString("call", null);
        boolean video = "video".equals(d.optString("kind"));
        String title = d.optString("title", "DUNA");
        String body = (video ? "📹 Videollamada entrante" : "📞 Llamada entrante") + ("direct".equals(d.optString("ct", "direct")) ? "" : " · " + d.optString("from", ""));
        int nid = idFor("call:" + chat);
        PendingIntent open = openIntent(c, chat, call, nid);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_CALL)
                .setSmallIcon(R.drawable.ic_stat_duna)
                .setColor(0xFF6D4BFF)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(true)
                .setTimeoutAfter(45000)
                .setContentIntent(open)
                .setFullScreenIntent(open, true)
                .addAction(0, "Contestar", open)
                .addAction(0, "Ignorar", PendingIntent.getBroadcast(c, nid, new Intent(c, DismissReceiver.class).putExtra("nid", nid), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        try { NotificationManagerCompat.from(c).notify(nid, b.build()); } catch (SecurityException ignored) { }
    }

    static void clearChat(Context c, String chat) {
        history.remove(chat); meta.remove(chat);
        NotificationManagerCompat.from(c).cancel(idFor(chat));
        NotificationManagerCompat.from(c).cancel(idFor("call:" + chat));
    }

    static void test(Context c) {
        channels(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_MSG)
                .setSmallIcon(R.drawable.ic_stat_duna).setColor(0xFF6D4BFF)
                .setContentTitle("DUNA").setContentText("Así se verán tus notificaciones")
                .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true)
                .setContentIntent(openIntent(c, null, null, 7));
        try { NotificationManagerCompat.from(c).notify(7, b.build()); } catch (SecurityException ignored) { }
    }
}

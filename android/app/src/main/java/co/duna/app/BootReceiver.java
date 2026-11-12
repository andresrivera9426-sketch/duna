package co.duna.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al encender el teléfono o actualizar la app, vuelve a conectar las notificaciones. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (Store.registered(c)) PushService.start(c);
    }
}

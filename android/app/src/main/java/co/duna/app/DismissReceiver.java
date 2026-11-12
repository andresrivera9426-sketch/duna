package co.duna.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

public class DismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) { NotificationManagerCompat.from(c).cancel(i.getIntExtra("nid", 0)); }
}

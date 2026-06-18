Sistem Grading TBS dan Tenera Dura - Versi Firebase Realtime

Isi file:
- index.html
- styles.css
- app.js
- FIREBASE_RULES.txt

Firebase project yang sudah dipasang di app.js:
projectId: grading-tenera-dura

Collection Firestore yang dipakai otomatis:
- gradingTransactions
- teneraDuraTransactions
- suppliers
- drivers
- auditLogs
- settings/app

Cara pakai:
1. Pastikan Firestore Database sudah aktif.
2. Pastikan Authentication > Sign-in method > Anonymous sudah Enabled.
3. Publish Firestore Rules sesuai FIREBASE_RULES.txt.
4. Upload folder ini ke Firebase Hosting atau jalankan lokal dengan browser.
5. Masuk aplikasi dengan kode: 456789.

Catatan realtime:
- Data disimpan ke Cloud Firestore.
- Perangkat lain yang membuka aplikasi dan masuk dengan kode yang sama akan menerima update realtime.
- LocalStorage masih dipakai sebagai cache/backup lokal.
- Status Firebase muncul di kanan atas pada tampilan desktop.

Catatan Excel:
- Export Excel menggunakan SheetJS dari CDN, jadi export membutuhkan internet saat library belum tersimpan cache browser.

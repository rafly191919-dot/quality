REVISI REALTIME TIAP HP

Yang diperiksa dan diperbaiki:
1. Firebase config tetap memakai project yang sama: grading-tenera-dura.
2. Collection utama tidak diubah: gradingTransactions, teneraDuraTransactions, suppliers, drivers, plates, settings, auditLogs.
3. Listener Firestore onSnapshot tetap aktif untuk grading, tenera dura, supplier, driver, settings, dan audit log.
4. Sinkronisasi tidak lagi menambah menu/status Firebase ke tampilan utama. Sinkronisasi berjalan di belakang layar.
5. Data yang ditulis ke Firestore memakai merge agar field lama tidak mudah tertimpa.
6. Sinkronisasi massal tidak lagi menghapus dokumen remote otomatis, agar data dari HP lain tidak terhapus ketika perangkat lain belum menerima snapshot terbaru.
7. Hapus data tetap menghapus dokumen Firestore secara eksplisit saat Staff menekan Hapus.
8. Jika user input saat koneksi sinkron belum siap, perubahan ditandai sebagai pending dan akan dicoba sinkron setelah koneksi aktif.

Agar realtime antar HP berjalan:
1. Deploy ke Firebase Hosting atau jalankan dari localhost, jangan dari file://.
2. Authentication > Sign-in method > Anonymous harus Enabled.
3. Firestore Rules harus mengizinkan request.auth != null.
4. Semua HP harus membuka URL deploy yang sama.
5. Setelah input dari HP pertama, HP kedua akan update otomatis selama koneksi internet aktif.

Catatan:
- Tidak ada menu Firebase/Realtime tambahan di UI.
- Jika koneksi internet putus, aplikasi tetap bisa bekerja lokal sementara, lalu akan mencoba sinkron lagi saat koneksi tersedia.

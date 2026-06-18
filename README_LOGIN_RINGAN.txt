REVISI LOGIN RINGAN - GRADING TBS DAN TENERA DURA

Perubahan:
1. Login tidak lagi dikunci oleh koneksi Firebase.
2. Kode operator: 123456.
3. Kode staff: 456789.
4. Operator tetap tidak bisa edit/hapus/master data/pengaturan.
5. Staff tetap punya akses penuh.
6. Saat Firebase belum tersambung atau web dibuka dari file HTML langsung, aplikasi tetap bisa masuk dan berjalan dengan data lokal.
7. Firebase tetap dicoba otomatis di belakang layar. Jika tersedia, data akan sinkron ke Firestore yang sama.
8. Firebase config, project, database, dan collection tidak diubah.

Catatan:
- Untuk realtime Firebase paling stabil, jalankan via localhost atau Firebase Hosting.
- Namun untuk pemakaian cepat, index.html tetap bisa dibuka langsung dan login tetap berfungsi.
- Data lokal akan tersimpan di browser selama belum tersinkron ke Firebase.

REVISI REALTIME FINAL

- Firebase project tetap: grading-tenera-dura.
- Collection tidak diubah.
- Data utama dibaca dari Firestore realtime memakai listener onSnapshot().
- Simpan/edit Grading dan Tenera Dura langsung mencoba menulis dokumen ke Firestore.
- Jika ada perubahan dari HP lain, aplikasi menampilkan toast: Data realtime diperbarui dari perangkat lain.
- Petugas grading/input bisa diketik manual dan otomatis masuk list dari data sebelumnya.
- Tampilan header HP diperbaiki agar tidak terlalu tinggi dan tombol header tidak menutupi layar.
- Sidebar HP memiliki tombol Tutup dan backdrop.

Cara cek realtime:
1. Deploy ke Firebase Hosting atau jalankan dari localhost, bukan file://.
2. Pastikan Anonymous Auth aktif.
3. Pastikan Firestore Rules: allow read, write: if request.auth != null;
4. Buka URL yang sama di dua HP.
5. Input data di HP 1, lihat Data Transaksi di HP 2 tanpa refresh.

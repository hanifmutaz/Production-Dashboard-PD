// Halaman yang belum di-port (Tahap E berlanjut). Jujur: tidak menampilkan data dummy.
export function NotYet({ name }: { readonly name: string }) {
  return (
    <div className="page">
      <div className="card soon">Halaman {name} sedang dibangun ulang dari mockup. Belum menampilkan data.</div>
    </div>
  );
}

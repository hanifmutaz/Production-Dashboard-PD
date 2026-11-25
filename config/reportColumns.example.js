// reportColumns.example.js — mapping kolom view i-Reporter/ConMas (SSoT).
// Salin jadi config/reportColumns.js (file asli di-gitignore, jangan commit).
// Nama view beda per instance: set DB_VIEW_NAME di .env.
//
// Dibangun ulang dari: reportColumns.js lama + daftar header view
// (1.034 kolom) + HOURLY/SLOTS di dashboard lama.
// ⚠️ Kolom minute/masalah/kategori di REJECT_PAIRS DITURUNKAN dari pola offset
//   (kategori = qty-7, masalah = qty-4, minute = qty+2). Pola cocok pada sampel
//   header, tapi WAJIB divalidasi dengan scripts/validateColumns.js terhadap
//   docs/view_columns.txt sebelum dipakai.

const VIEW = process.env.DB_VIEW_NAME || "view_report_25415";

const COLS = {
  production_mode: "cluster_1_1_t",
  // identitas report
  line: "cluster_1_17_t",
  cell_leader: "cluster_1_30_t",
  teknisi: "cluster_1_43_t",
  inspector: "cluster_1_55_t",
  group: "cluster_1_56_t",
  line_leader: "cluster_1_67_t",
  tanggal: "cluster_1_44_d",
  shift: "cluster_1_68_t", // contoh nilai: "Shift 1 (2 Shift)"

  // KPI utama
  oee: "cluster_1_85_n",
  availability: "cluster_1_92_n",
  performance: "cluster_1_99_n",
  quality: "cluster_1_106_n",
  reject_ppm: "cluster_1_113_n",

  // output & reject
  output_plan: "cluster_1_2913_n",
  output_actual: "cluster_1_2914_n",
  reject_p027: "cluster_1_2915_n",
  reject_p028: "cluster_1_2916_n",
  reject_m107: "cluster_1_2917_n",

  // jam (satuan BELUM terkonfirmasi: jam atau menit)
  jam_target: "cluster_1_2918_n", // dulu dinamai stoptime_plan
  jam_efektif: "cluster_1_2919_n", // dulu dinamai stoptime_actual

  // loss & kadoritsu (rumus agregasi BELUM terkonfirmasi)
  availability_loss: "cluster_1_2920_n",
  performance_loss: "cluster_1_2921_n",
  quality_loss: "cluster_1_2922_n",
  not_oee: "cluster_1_2923_n",
  sogo: "cluster_1_2924_n",
  shugyo: "cluster_1_2925_n",
  kikai: "cluster_1_2926_n",

  // stoptime per 4M(+Other)
  stoptime_man: "cluster_1_2797_n",
  stoptime_method: "cluster_1_2820_n",
  stoptime_material: "cluster_1_2843_n",
  stoptime_machine: "cluster_1_2866_n",
  stoptime_other: "cluster_1_2889_n",
  change_point: "cluster_1_2912_n",

  // metadata revisi (anti double counting)
  rep_top_id: "rep_top_id",
  rev_no: "rev_no",
  public_status: "public_status",
  sys_update_time: "sys_update_time",
};

// ALIAS kompatibilitas dengan logika dashboard lama (jangan dipakai di kode baru)
// qty_reject (lama) = reject_m107 ; stoptime_plan = jam_target ; stoptime_actual = jam_efektif
// Di dashboard lama: stoptime_total = jam_target - jam_efektif
// deviasi_target lama TIDAK dibaca dari DB (kolom 2915 salah); selalu actual - plan.
const LEGACY_ALIASES = {
  qty_reject: COLS.reject_m107,
  stoptime_plan: COLS.jam_target,
  stoptime_actual: COLS.jam_efektif,
};

// 6 slot produk, terisi sekuensial (slot N+1 terisi kalau ada Change Model)
const PRODUCT_SLOTS = [
  { cl_no: "cluster_1_7_t",  product_name: "cluster_1_8_t",  mo_no: "cluster_1_9_t",  qty: "cluster_1_10_n", swi: "cluster_1_12_n", actual: "cluster_1_13_n" },
  { cl_no: "cluster_1_20_t", product_name: "cluster_1_21_t", mo_no: "cluster_1_22_t", qty: "cluster_1_23_n", swi: "cluster_1_25_n", actual: "cluster_1_26_n" },
  { cl_no: "cluster_1_33_t", product_name: "cluster_1_34_t", mo_no: "cluster_1_35_t", qty: "cluster_1_36_n", swi: "cluster_1_38_n", actual: "cluster_1_39_n" },
  { cl_no: "cluster_1_45_t", product_name: "cluster_1_46_t", mo_no: "cluster_1_47_t", qty: "cluster_1_48_n", swi: "cluster_1_50_n", actual: "cluster_1_51_n" },
  { cl_no: "cluster_1_57_t", product_name: "cluster_1_58_t", mo_no: "cluster_1_59_t", qty: "cluster_1_60_n", swi: "cluster_1_62_n", actual: "cluster_1_63_n" },
  { cl_no: "cluster_1_69_t", product_name: "cluster_1_70_t", mo_no: "cluster_1_71_t", qty: "cluster_1_72_n", swi: "cluster_1_74_n", actual: "cluster_1_75_n" },
];

// 25 slot output per jam (urutan fisik form, BUKAN jam absolut). [plan, actual]
// Label jam dihitung dari HOURLY_BASE_START_HOUR(6) + index + HOURLY_SLOT_OFFSET.
const HOURLY_COLUMNS = [
  ["cluster_1_151_n", "cluster_1_152_n"],
  ["cluster_1_256_n", "cluster_1_257_n"],
  ["cluster_1_361_n", "cluster_1_362_n"],
  ["cluster_1_466_n", "cluster_1_467_n"],
  ["cluster_1_571_n", "cluster_1_572_n"],
  ["cluster_1_676_n", "cluster_1_677_n"],
  ["cluster_1_781_n", "cluster_1_782_n"],
  ["cluster_1_886_n", "cluster_1_887_n"],
  ["cluster_1_991_n", "cluster_1_992_n"],
  ["cluster_1_1096_n", "cluster_1_1097_n"],
  ["cluster_1_1201_n", "cluster_1_1202_n"],
  ["cluster_1_1306_n", "cluster_1_1307_n"],
  ["cluster_1_1411_n", "cluster_1_1412_n"],
  ["cluster_1_1516_n", "cluster_1_1517_n"],
  ["cluster_1_1621_n", "cluster_1_1622_n"],
  ["cluster_1_1726_n", "cluster_1_1727_n"],
  ["cluster_1_1831_n", "cluster_1_1832_n"],
  ["cluster_1_1936_n", "cluster_1_1937_n"],
  ["cluster_1_2041_n", "cluster_1_2042_n"],
  ["cluster_1_2146_n", "cluster_1_2147_n"],
  ["cluster_1_2251_n", "cluster_1_2252_n"],
  ["cluster_1_2356_n", "cluster_1_2357_n"],
  ["cluster_1_2461_n", "cluster_1_2462_n"],
  ["cluster_1_2566_n", "cluster_1_2567_n"],
  ["cluster_1_2671_n", "cluster_1_2672_n"],
];

// 150 slot defect/stoptime. Satu slot = Kategori + Masalah + Minute + Qty Reject M107 + Nama Reject.
// Slot terisi sekuensial dari slot pertama; slot kosong (name/qty null) harus difilter.
const REJECT_PAIRS = [
  { qty: "cluster_1_165_n", name: "cluster_1_166_t", minute: "cluster_1_167_n", masalah: "cluster_1_161_t", kategori: "cluster_1_158_t" },
  { qty: "cluster_1_184_n", name: "cluster_1_185_t", minute: "cluster_1_186_n", masalah: "cluster_1_180_t", kategori: "cluster_1_177_t" },
  { qty: "cluster_1_200_n", name: "cluster_1_201_t", minute: "cluster_1_202_n", masalah: "cluster_1_196_t", kategori: "cluster_1_193_t" },
  { qty: "cluster_1_216_n", name: "cluster_1_217_t", minute: "cluster_1_218_n", masalah: "cluster_1_212_t", kategori: "cluster_1_209_t" },
  { qty: "cluster_1_232_n", name: "cluster_1_233_t", minute: "cluster_1_234_n", masalah: "cluster_1_228_t", kategori: "cluster_1_225_t" },
  { qty: "cluster_1_248_n", name: "cluster_1_249_t", minute: "cluster_1_250_n", masalah: "cluster_1_244_t", kategori: "cluster_1_241_t" },
  { qty: "cluster_1_270_n", name: "cluster_1_271_t", minute: "cluster_1_272_n", masalah: "cluster_1_266_t", kategori: "cluster_1_263_t" },
  { qty: "cluster_1_289_n", name: "cluster_1_290_t", minute: "cluster_1_291_n", masalah: "cluster_1_285_t", kategori: "cluster_1_282_t" },
  { qty: "cluster_1_305_n", name: "cluster_1_306_t", minute: "cluster_1_307_n", masalah: "cluster_1_301_t", kategori: "cluster_1_298_t" },
  { qty: "cluster_1_321_n", name: "cluster_1_322_t", minute: "cluster_1_323_n", masalah: "cluster_1_317_t", kategori: "cluster_1_314_t" },
  { qty: "cluster_1_337_n", name: "cluster_1_338_t", minute: "cluster_1_339_n", masalah: "cluster_1_333_t", kategori: "cluster_1_330_t" },
  { qty: "cluster_1_353_n", name: "cluster_1_354_t", minute: "cluster_1_355_n", masalah: "cluster_1_349_t", kategori: "cluster_1_346_t" },
  { qty: "cluster_1_375_n", name: "cluster_1_376_t", minute: "cluster_1_377_n", masalah: "cluster_1_371_t", kategori: "cluster_1_368_t" },
  { qty: "cluster_1_394_n", name: "cluster_1_395_t", minute: "cluster_1_396_n", masalah: "cluster_1_390_t", kategori: "cluster_1_387_t" },
  { qty: "cluster_1_410_n", name: "cluster_1_411_t", minute: "cluster_1_412_n", masalah: "cluster_1_406_t", kategori: "cluster_1_403_t" },
  { qty: "cluster_1_426_n", name: "cluster_1_427_t", minute: "cluster_1_428_n", masalah: "cluster_1_422_t", kategori: "cluster_1_419_t" },
  { qty: "cluster_1_442_n", name: "cluster_1_443_t", minute: "cluster_1_444_n", masalah: "cluster_1_438_t", kategori: "cluster_1_435_t" },
  { qty: "cluster_1_458_n", name: "cluster_1_459_t", minute: "cluster_1_460_n", masalah: "cluster_1_454_t", kategori: "cluster_1_451_t" },
  { qty: "cluster_1_480_n", name: "cluster_1_481_t", minute: "cluster_1_482_n", masalah: "cluster_1_476_t", kategori: "cluster_1_473_t" },
  { qty: "cluster_1_499_n", name: "cluster_1_500_t", minute: "cluster_1_501_n", masalah: "cluster_1_495_t", kategori: "cluster_1_492_t" },
  { qty: "cluster_1_515_n", name: "cluster_1_516_t", minute: "cluster_1_517_n", masalah: "cluster_1_511_t", kategori: "cluster_1_508_t" },
  { qty: "cluster_1_531_n", name: "cluster_1_532_t", minute: "cluster_1_533_n", masalah: "cluster_1_527_t", kategori: "cluster_1_524_t" },
  { qty: "cluster_1_547_n", name: "cluster_1_548_t", minute: "cluster_1_549_n", masalah: "cluster_1_543_t", kategori: "cluster_1_540_t" },
  { qty: "cluster_1_563_n", name: "cluster_1_564_t", minute: "cluster_1_565_n", masalah: "cluster_1_559_t", kategori: "cluster_1_556_t" },
  { qty: "cluster_1_585_n", name: "cluster_1_586_t", minute: "cluster_1_587_n", masalah: "cluster_1_581_t", kategori: "cluster_1_578_t" },
  { qty: "cluster_1_604_n", name: "cluster_1_605_t", minute: "cluster_1_606_n", masalah: "cluster_1_600_t", kategori: "cluster_1_597_t" },
  { qty: "cluster_1_620_n", name: "cluster_1_621_t", minute: "cluster_1_622_n", masalah: "cluster_1_616_t", kategori: "cluster_1_613_t" },
  { qty: "cluster_1_636_n", name: "cluster_1_637_t", minute: "cluster_1_638_n", masalah: "cluster_1_632_t", kategori: "cluster_1_629_t" },
  { qty: "cluster_1_652_n", name: "cluster_1_653_t", minute: "cluster_1_654_n", masalah: "cluster_1_648_t", kategori: "cluster_1_645_t" },
  { qty: "cluster_1_668_n", name: "cluster_1_669_t", minute: "cluster_1_670_n", masalah: "cluster_1_664_t", kategori: "cluster_1_661_t" },
  { qty: "cluster_1_690_n", name: "cluster_1_691_t", minute: "cluster_1_692_n", masalah: "cluster_1_686_t", kategori: "cluster_1_683_t" },
  { qty: "cluster_1_709_n", name: "cluster_1_710_t", minute: "cluster_1_711_n", masalah: "cluster_1_705_t", kategori: "cluster_1_702_t" },
  { qty: "cluster_1_725_n", name: "cluster_1_726_t", minute: "cluster_1_727_n", masalah: "cluster_1_721_t", kategori: "cluster_1_718_t" },
  { qty: "cluster_1_741_n", name: "cluster_1_742_t", minute: "cluster_1_743_n", masalah: "cluster_1_737_t", kategori: "cluster_1_734_t" },
  { qty: "cluster_1_757_n", name: "cluster_1_758_t", minute: "cluster_1_759_n", masalah: "cluster_1_753_t", kategori: "cluster_1_750_t" },
  { qty: "cluster_1_773_n", name: "cluster_1_774_t", minute: "cluster_1_775_n", masalah: "cluster_1_769_t", kategori: "cluster_1_766_t" },
  { qty: "cluster_1_795_n", name: "cluster_1_796_t", minute: "cluster_1_797_n", masalah: "cluster_1_791_t", kategori: "cluster_1_788_t" },
  { qty: "cluster_1_814_n", name: "cluster_1_815_t", minute: "cluster_1_816_n", masalah: "cluster_1_810_t", kategori: "cluster_1_807_t" },
  { qty: "cluster_1_830_n", name: "cluster_1_831_t", minute: "cluster_1_832_n", masalah: "cluster_1_826_t", kategori: "cluster_1_823_t" },
  { qty: "cluster_1_846_n", name: "cluster_1_847_t", minute: "cluster_1_848_n", masalah: "cluster_1_842_t", kategori: "cluster_1_839_t" },
  { qty: "cluster_1_862_n", name: "cluster_1_863_t", minute: "cluster_1_864_n", masalah: "cluster_1_858_t", kategori: "cluster_1_855_t" },
  { qty: "cluster_1_878_n", name: "cluster_1_879_t", minute: "cluster_1_880_n", masalah: "cluster_1_874_t", kategori: "cluster_1_871_t" },
  { qty: "cluster_1_900_n", name: "cluster_1_901_t", minute: "cluster_1_902_n", masalah: "cluster_1_896_t", kategori: "cluster_1_893_t" },
  { qty: "cluster_1_919_n", name: "cluster_1_920_t", minute: "cluster_1_921_n", masalah: "cluster_1_915_t", kategori: "cluster_1_912_t" },
  { qty: "cluster_1_935_n", name: "cluster_1_936_t", minute: "cluster_1_937_n", masalah: "cluster_1_931_t", kategori: "cluster_1_928_t" },
  { qty: "cluster_1_951_n", name: "cluster_1_952_t", minute: "cluster_1_953_n", masalah: "cluster_1_947_t", kategori: "cluster_1_944_t" },
  { qty: "cluster_1_967_n", name: "cluster_1_968_t", minute: "cluster_1_969_n", masalah: "cluster_1_963_t", kategori: "cluster_1_960_t" },
  { qty: "cluster_1_983_n", name: "cluster_1_984_t", minute: "cluster_1_985_n", masalah: "cluster_1_979_t", kategori: "cluster_1_976_t" },
  { qty: "cluster_1_1005_n", name: "cluster_1_1006_t", minute: "cluster_1_1007_n", masalah: "cluster_1_1001_t", kategori: "cluster_1_998_t" },
  { qty: "cluster_1_1024_n", name: "cluster_1_1025_t", minute: "cluster_1_1026_n", masalah: "cluster_1_1020_t", kategori: "cluster_1_1017_t" },
  { qty: "cluster_1_1040_n", name: "cluster_1_1041_t", minute: "cluster_1_1042_n", masalah: "cluster_1_1036_t", kategori: "cluster_1_1033_t" },
  { qty: "cluster_1_1056_n", name: "cluster_1_1057_t", minute: "cluster_1_1058_n", masalah: "cluster_1_1052_t", kategori: "cluster_1_1049_t" },
  { qty: "cluster_1_1072_n", name: "cluster_1_1073_t", minute: "cluster_1_1074_n", masalah: "cluster_1_1068_t", kategori: "cluster_1_1065_t" },
  { qty: "cluster_1_1088_n", name: "cluster_1_1089_t", minute: "cluster_1_1090_n", masalah: "cluster_1_1084_t", kategori: "cluster_1_1081_t" },
  { qty: "cluster_1_1110_n", name: "cluster_1_1111_t", minute: "cluster_1_1112_n", masalah: "cluster_1_1106_t", kategori: "cluster_1_1103_t" },
  { qty: "cluster_1_1129_n", name: "cluster_1_1130_t", minute: "cluster_1_1131_n", masalah: "cluster_1_1125_t", kategori: "cluster_1_1122_t" },
  { qty: "cluster_1_1145_n", name: "cluster_1_1146_t", minute: "cluster_1_1147_n", masalah: "cluster_1_1141_t", kategori: "cluster_1_1138_t" },
  { qty: "cluster_1_1161_n", name: "cluster_1_1162_t", minute: "cluster_1_1163_n", masalah: "cluster_1_1157_t", kategori: "cluster_1_1154_t" },
  { qty: "cluster_1_1177_n", name: "cluster_1_1178_t", minute: "cluster_1_1179_n", masalah: "cluster_1_1173_t", kategori: "cluster_1_1170_t" },
  { qty: "cluster_1_1193_n", name: "cluster_1_1194_t", minute: "cluster_1_1195_n", masalah: "cluster_1_1189_t", kategori: "cluster_1_1186_t" },
  { qty: "cluster_1_1215_n", name: "cluster_1_1216_t", minute: "cluster_1_1217_n", masalah: "cluster_1_1211_t", kategori: "cluster_1_1208_t" },
  { qty: "cluster_1_1234_n", name: "cluster_1_1235_t", minute: "cluster_1_1236_n", masalah: "cluster_1_1230_t", kategori: "cluster_1_1227_t" },
  { qty: "cluster_1_1250_n", name: "cluster_1_1251_t", minute: "cluster_1_1252_n", masalah: "cluster_1_1246_t", kategori: "cluster_1_1243_t" },
  { qty: "cluster_1_1266_n", name: "cluster_1_1267_t", minute: "cluster_1_1268_n", masalah: "cluster_1_1262_t", kategori: "cluster_1_1259_t" },
  { qty: "cluster_1_1282_n", name: "cluster_1_1283_t", minute: "cluster_1_1284_n", masalah: "cluster_1_1278_t", kategori: "cluster_1_1275_t" },
  { qty: "cluster_1_1298_n", name: "cluster_1_1299_t", minute: "cluster_1_1300_n", masalah: "cluster_1_1294_t", kategori: "cluster_1_1291_t" },
  { qty: "cluster_1_1320_n", name: "cluster_1_1321_t", minute: "cluster_1_1322_n", masalah: "cluster_1_1316_t", kategori: "cluster_1_1313_t" },
  { qty: "cluster_1_1339_n", name: "cluster_1_1340_t", minute: "cluster_1_1341_n", masalah: "cluster_1_1335_t", kategori: "cluster_1_1332_t" },
  { qty: "cluster_1_1355_n", name: "cluster_1_1356_t", minute: "cluster_1_1357_n", masalah: "cluster_1_1351_t", kategori: "cluster_1_1348_t" },
  { qty: "cluster_1_1371_n", name: "cluster_1_1372_t", minute: "cluster_1_1373_n", masalah: "cluster_1_1367_t", kategori: "cluster_1_1364_t" },
  { qty: "cluster_1_1387_n", name: "cluster_1_1388_t", minute: "cluster_1_1389_n", masalah: "cluster_1_1383_t", kategori: "cluster_1_1380_t" },
  { qty: "cluster_1_1403_n", name: "cluster_1_1404_t", minute: "cluster_1_1405_n", masalah: "cluster_1_1399_t", kategori: "cluster_1_1396_t" },
  { qty: "cluster_1_1425_n", name: "cluster_1_1426_t", minute: "cluster_1_1427_n", masalah: "cluster_1_1421_t", kategori: "cluster_1_1418_t" },
  { qty: "cluster_1_1444_n", name: "cluster_1_1445_t", minute: "cluster_1_1446_n", masalah: "cluster_1_1440_t", kategori: "cluster_1_1437_t" },
  { qty: "cluster_1_1460_n", name: "cluster_1_1461_t", minute: "cluster_1_1462_n", masalah: "cluster_1_1456_t", kategori: "cluster_1_1453_t" },
  { qty: "cluster_1_1476_n", name: "cluster_1_1477_t", minute: "cluster_1_1478_n", masalah: "cluster_1_1472_t", kategori: "cluster_1_1469_t" },
  { qty: "cluster_1_1492_n", name: "cluster_1_1493_t", minute: "cluster_1_1494_n", masalah: "cluster_1_1488_t", kategori: "cluster_1_1485_t" },
  { qty: "cluster_1_1508_n", name: "cluster_1_1509_t", minute: "cluster_1_1510_n", masalah: "cluster_1_1504_t", kategori: "cluster_1_1501_t" },
  { qty: "cluster_1_1530_n", name: "cluster_1_1531_t", minute: "cluster_1_1532_n", masalah: "cluster_1_1526_t", kategori: "cluster_1_1523_t" },
  { qty: "cluster_1_1549_n", name: "cluster_1_1550_t", minute: "cluster_1_1551_n", masalah: "cluster_1_1545_t", kategori: "cluster_1_1542_t" },
  { qty: "cluster_1_1565_n", name: "cluster_1_1566_t", minute: "cluster_1_1567_n", masalah: "cluster_1_1561_t", kategori: "cluster_1_1558_t" },
  { qty: "cluster_1_1581_n", name: "cluster_1_1582_t", minute: "cluster_1_1583_n", masalah: "cluster_1_1577_t", kategori: "cluster_1_1574_t" },
  { qty: "cluster_1_1597_n", name: "cluster_1_1598_t", minute: "cluster_1_1599_n", masalah: "cluster_1_1593_t", kategori: "cluster_1_1590_t" },
  { qty: "cluster_1_1613_n", name: "cluster_1_1614_t", minute: "cluster_1_1615_n", masalah: "cluster_1_1609_t", kategori: "cluster_1_1606_t" },
  { qty: "cluster_1_1635_n", name: "cluster_1_1636_t", minute: "cluster_1_1637_n", masalah: "cluster_1_1631_t", kategori: "cluster_1_1628_t" },
  { qty: "cluster_1_1654_n", name: "cluster_1_1655_t", minute: "cluster_1_1656_n", masalah: "cluster_1_1650_t", kategori: "cluster_1_1647_t" },
  { qty: "cluster_1_1670_n", name: "cluster_1_1671_t", minute: "cluster_1_1672_n", masalah: "cluster_1_1666_t", kategori: "cluster_1_1663_t" },
  { qty: "cluster_1_1686_n", name: "cluster_1_1687_t", minute: "cluster_1_1688_n", masalah: "cluster_1_1682_t", kategori: "cluster_1_1679_t" },
  { qty: "cluster_1_1702_n", name: "cluster_1_1703_t", minute: "cluster_1_1704_n", masalah: "cluster_1_1698_t", kategori: "cluster_1_1695_t" },
  { qty: "cluster_1_1718_n", name: "cluster_1_1719_t", minute: "cluster_1_1720_n", masalah: "cluster_1_1714_t", kategori: "cluster_1_1711_t" },
  { qty: "cluster_1_1740_n", name: "cluster_1_1741_t", minute: "cluster_1_1742_n", masalah: "cluster_1_1736_t", kategori: "cluster_1_1733_t" },
  { qty: "cluster_1_1759_n", name: "cluster_1_1760_t", minute: "cluster_1_1761_n", masalah: "cluster_1_1755_t", kategori: "cluster_1_1752_t" },
  { qty: "cluster_1_1775_n", name: "cluster_1_1776_t", minute: "cluster_1_1777_n", masalah: "cluster_1_1771_t", kategori: "cluster_1_1768_t" },
  { qty: "cluster_1_1791_n", name: "cluster_1_1792_t", minute: "cluster_1_1793_n", masalah: "cluster_1_1787_t", kategori: "cluster_1_1784_t" },
  { qty: "cluster_1_1807_n", name: "cluster_1_1808_t", minute: "cluster_1_1809_n", masalah: "cluster_1_1803_t", kategori: "cluster_1_1800_t" },
  { qty: "cluster_1_1823_n", name: "cluster_1_1824_t", minute: "cluster_1_1825_n", masalah: "cluster_1_1819_t", kategori: "cluster_1_1816_t" },
  { qty: "cluster_1_1845_n", name: "cluster_1_1846_t", minute: "cluster_1_1847_n", masalah: "cluster_1_1841_t", kategori: "cluster_1_1838_t" },
  { qty: "cluster_1_1864_n", name: "cluster_1_1865_t", minute: "cluster_1_1866_n", masalah: "cluster_1_1860_t", kategori: "cluster_1_1857_t" },
  { qty: "cluster_1_1880_n", name: "cluster_1_1881_t", minute: "cluster_1_1882_n", masalah: "cluster_1_1876_t", kategori: "cluster_1_1873_t" },
  { qty: "cluster_1_1896_n", name: "cluster_1_1897_t", minute: "cluster_1_1898_n", masalah: "cluster_1_1892_t", kategori: "cluster_1_1889_t" },
  { qty: "cluster_1_1912_n", name: "cluster_1_1913_t", minute: "cluster_1_1914_n", masalah: "cluster_1_1908_t", kategori: "cluster_1_1905_t" },
  { qty: "cluster_1_1928_n", name: "cluster_1_1929_t", minute: "cluster_1_1930_n", masalah: "cluster_1_1924_t", kategori: "cluster_1_1921_t" },
  { qty: "cluster_1_1950_n", name: "cluster_1_1951_t", minute: "cluster_1_1952_n", masalah: "cluster_1_1946_t", kategori: "cluster_1_1943_t" },
  { qty: "cluster_1_1969_n", name: "cluster_1_1970_t", minute: "cluster_1_1971_n", masalah: "cluster_1_1965_t", kategori: "cluster_1_1962_t" },
  { qty: "cluster_1_1985_n", name: "cluster_1_1986_t", minute: "cluster_1_1987_n", masalah: "cluster_1_1981_t", kategori: "cluster_1_1978_t" },
  { qty: "cluster_1_2001_n", name: "cluster_1_2002_t", minute: "cluster_1_2003_n", masalah: "cluster_1_1997_t", kategori: "cluster_1_1994_t" },
  { qty: "cluster_1_2017_n", name: "cluster_1_2018_t", minute: "cluster_1_2019_n", masalah: "cluster_1_2013_t", kategori: "cluster_1_2010_t" },
  { qty: "cluster_1_2033_n", name: "cluster_1_2034_t", minute: "cluster_1_2035_n", masalah: "cluster_1_2029_t", kategori: "cluster_1_2026_t" },
  { qty: "cluster_1_2055_n", name: "cluster_1_2056_t", minute: "cluster_1_2057_n", masalah: "cluster_1_2051_t", kategori: "cluster_1_2048_t" },
  { qty: "cluster_1_2074_n", name: "cluster_1_2075_t", minute: "cluster_1_2076_n", masalah: "cluster_1_2070_t", kategori: "cluster_1_2067_t" },
  { qty: "cluster_1_2090_n", name: "cluster_1_2091_t", minute: "cluster_1_2092_n", masalah: "cluster_1_2086_t", kategori: "cluster_1_2083_t" },
  { qty: "cluster_1_2106_n", name: "cluster_1_2107_t", minute: "cluster_1_2108_n", masalah: "cluster_1_2102_t", kategori: "cluster_1_2099_t" },
  { qty: "cluster_1_2122_n", name: "cluster_1_2123_t", minute: "cluster_1_2124_n", masalah: "cluster_1_2118_t", kategori: "cluster_1_2115_t" },
  { qty: "cluster_1_2138_n", name: "cluster_1_2139_t", minute: "cluster_1_2140_n", masalah: "cluster_1_2134_t", kategori: "cluster_1_2131_t" },
  { qty: "cluster_1_2160_n", name: "cluster_1_2161_t", minute: "cluster_1_2162_n", masalah: "cluster_1_2156_t", kategori: "cluster_1_2153_t" },
  { qty: "cluster_1_2179_n", name: "cluster_1_2180_t", minute: "cluster_1_2181_n", masalah: "cluster_1_2175_t", kategori: "cluster_1_2172_t" },
  { qty: "cluster_1_2195_n", name: "cluster_1_2196_t", minute: "cluster_1_2197_n", masalah: "cluster_1_2191_t", kategori: "cluster_1_2188_t" },
  { qty: "cluster_1_2211_n", name: "cluster_1_2212_t", minute: "cluster_1_2213_n", masalah: "cluster_1_2207_t", kategori: "cluster_1_2204_t" },
  { qty: "cluster_1_2227_n", name: "cluster_1_2228_t", minute: "cluster_1_2229_n", masalah: "cluster_1_2223_t", kategori: "cluster_1_2220_t" },
  { qty: "cluster_1_2243_n", name: "cluster_1_2244_t", minute: "cluster_1_2245_n", masalah: "cluster_1_2239_t", kategori: "cluster_1_2236_t" },
  { qty: "cluster_1_2265_n", name: "cluster_1_2266_t", minute: "cluster_1_2267_n", masalah: "cluster_1_2261_t", kategori: "cluster_1_2258_t" },
  { qty: "cluster_1_2284_n", name: "cluster_1_2285_t", minute: "cluster_1_2286_n", masalah: "cluster_1_2280_t", kategori: "cluster_1_2277_t" },
  { qty: "cluster_1_2300_n", name: "cluster_1_2301_t", minute: "cluster_1_2302_n", masalah: "cluster_1_2296_t", kategori: "cluster_1_2293_t" },
  { qty: "cluster_1_2316_n", name: "cluster_1_2317_t", minute: "cluster_1_2318_n", masalah: "cluster_1_2312_t", kategori: "cluster_1_2309_t" },
  { qty: "cluster_1_2332_n", name: "cluster_1_2333_t", minute: "cluster_1_2334_n", masalah: "cluster_1_2328_t", kategori: "cluster_1_2325_t" },
  { qty: "cluster_1_2348_n", name: "cluster_1_2349_t", minute: "cluster_1_2350_n", masalah: "cluster_1_2344_t", kategori: "cluster_1_2341_t" },
  { qty: "cluster_1_2370_n", name: "cluster_1_2371_t", minute: "cluster_1_2372_n", masalah: "cluster_1_2366_t", kategori: "cluster_1_2363_t" },
  { qty: "cluster_1_2389_n", name: "cluster_1_2390_t", minute: "cluster_1_2391_n", masalah: "cluster_1_2385_t", kategori: "cluster_1_2382_t" },
  { qty: "cluster_1_2405_n", name: "cluster_1_2406_t", minute: "cluster_1_2407_n", masalah: "cluster_1_2401_t", kategori: "cluster_1_2398_t" },
  { qty: "cluster_1_2421_n", name: "cluster_1_2422_t", minute: "cluster_1_2423_n", masalah: "cluster_1_2417_t", kategori: "cluster_1_2414_t" },
  { qty: "cluster_1_2437_n", name: "cluster_1_2438_t", minute: "cluster_1_2439_n", masalah: "cluster_1_2433_t", kategori: "cluster_1_2430_t" },
  { qty: "cluster_1_2453_n", name: "cluster_1_2454_t", minute: "cluster_1_2455_n", masalah: "cluster_1_2449_t", kategori: "cluster_1_2446_t" },
  { qty: "cluster_1_2475_n", name: "cluster_1_2476_t", minute: "cluster_1_2477_n", masalah: "cluster_1_2471_t", kategori: "cluster_1_2468_t" },
  { qty: "cluster_1_2494_n", name: "cluster_1_2495_t", minute: "cluster_1_2496_n", masalah: "cluster_1_2490_t", kategori: "cluster_1_2487_t" },
  { qty: "cluster_1_2510_n", name: "cluster_1_2511_t", minute: "cluster_1_2512_n", masalah: "cluster_1_2506_t", kategori: "cluster_1_2503_t" },
  { qty: "cluster_1_2526_n", name: "cluster_1_2527_t", minute: "cluster_1_2528_n", masalah: "cluster_1_2522_t", kategori: "cluster_1_2519_t" },
  { qty: "cluster_1_2542_n", name: "cluster_1_2543_t", minute: "cluster_1_2544_n", masalah: "cluster_1_2538_t", kategori: "cluster_1_2535_t" },
  { qty: "cluster_1_2558_n", name: "cluster_1_2559_t", minute: "cluster_1_2560_n", masalah: "cluster_1_2554_t", kategori: "cluster_1_2551_t" },
  { qty: "cluster_1_2580_n", name: "cluster_1_2581_t", minute: "cluster_1_2582_n", masalah: "cluster_1_2576_t", kategori: "cluster_1_2573_t" },
  { qty: "cluster_1_2599_n", name: "cluster_1_2600_t", minute: "cluster_1_2601_n", masalah: "cluster_1_2595_t", kategori: "cluster_1_2592_t" },
  { qty: "cluster_1_2615_n", name: "cluster_1_2616_t", minute: "cluster_1_2617_n", masalah: "cluster_1_2611_t", kategori: "cluster_1_2608_t" },
  { qty: "cluster_1_2631_n", name: "cluster_1_2632_t", minute: "cluster_1_2633_n", masalah: "cluster_1_2627_t", kategori: "cluster_1_2624_t" },
  { qty: "cluster_1_2647_n", name: "cluster_1_2648_t", minute: "cluster_1_2649_n", masalah: "cluster_1_2643_t", kategori: "cluster_1_2640_t" },
  { qty: "cluster_1_2663_n", name: "cluster_1_2664_t", minute: "cluster_1_2665_n", masalah: "cluster_1_2659_t", kategori: "cluster_1_2656_t" },
  { qty: "cluster_1_2685_n", name: "cluster_1_2686_t", minute: "cluster_1_2687_n", masalah: "cluster_1_2681_t", kategori: "cluster_1_2678_t" },
  { qty: "cluster_1_2704_n", name: "cluster_1_2705_t", minute: "cluster_1_2706_n", masalah: "cluster_1_2700_t", kategori: "cluster_1_2697_t" },
  { qty: "cluster_1_2720_n", name: "cluster_1_2721_t", minute: "cluster_1_2722_n", masalah: "cluster_1_2716_t", kategori: "cluster_1_2713_t" },
  { qty: "cluster_1_2736_n", name: "cluster_1_2737_t", minute: "cluster_1_2738_n", masalah: "cluster_1_2732_t", kategori: "cluster_1_2729_t" },
  { qty: "cluster_1_2752_n", name: "cluster_1_2753_t", minute: "cluster_1_2754_n", masalah: "cluster_1_2748_t", kategori: "cluster_1_2745_t" },
  { qty: "cluster_1_2768_n", name: "cluster_1_2769_t", minute: "cluster_1_2770_n", masalah: "cluster_1_2764_t", kategori: "cluster_1_2761_t" },
];

module.exports = { VIEW, COLS, LEGACY_ALIASES, PRODUCT_SLOTS, HOURLY_COLUMNS, REJECT_PAIRS };

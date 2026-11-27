// Kedua view memakai kolom inti yang sama. Kolom slot yang absen dibaca NULL oleh ColumnSql.
const base = require("./reportColumns.example.js");
module.exports = {
  ...base,
  PRODUCT_SLOTS: base.PRODUCT_SLOTS.map((slot, i) => ({
    ...slot,
    qty: 'cluster_1_' + (2781 + i * 23) + '_n'
  }))
};

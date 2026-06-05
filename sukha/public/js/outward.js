frappe.ui.form.on('Outward Sample', {
    custom_sample_cost(frm) {
        calculate_total_cost(frm);
    },
    custom_packing_cost(frm) {
        calculate_total_cost(frm);
    },
    custom_courier_cost(frm) {
        calculate_total_cost(frm);
    }
})

function calculate_total_cost(frm) {
    const sample_cost = frm.doc.custom_sample_cost || 0;
    const packing_cost = frm.doc.custom_packing_cost || 0;
    const courier_cost = frm.doc.custom_courier_cost || 0;
    const total_cost = parseFloat(sample_cost) + parseFloat(packing_cost) + parseFloat(courier_cost);

    if (isNaN(total_cost)) {
        frm.set_value("custom_total_sample_cost", 0);
        return;
    }
    frm.set_value("custom_total_sample_cost", parseFloat(total_cost.toFixed(2)));
}
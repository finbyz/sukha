// Copyright (c) 2026, kaustubh and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cost Sheet", {
	refresh(frm) {
		// Add custom button to open Cost Sheet Dashboard with current values
		if (frm.doc.name) {
			frm.add_custom_button(__('Open in Dashboard'), function() {
				// Store current form data in localStorage
				localStorage.setItem('cost_sheet_load_data', JSON.stringify(frm.doc));
				
				// Route to Cost Sheet Dashboard
				frappe.set_route('cost-sheet-dashboard');
				
				frappe.show_alert({
					message: __('Loading cost sheet in dashboard...'),
					indicator: 'green'
				}, 3);
			}, __('Actions'));
		}
	}
});

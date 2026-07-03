// Copyright (c) 2026, kaustubh and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cost Sheet", {
	refresh(frm) {
		// Add custom button to open Cost Sheet Dashboard with current values
		if (frm.doc.name) {
			var btn = frm.add_custom_button(__('Open in Dashboard'), function() {
				// Store current form data in localStorage
				localStorage.setItem('cost_sheet_load_data', JSON.stringify(frm.doc));
				localStorage.setItem('cost_sheet_load_data_name', JSON.stringify(frm.doc.name));
				
				// Route to Cost Sheet Dashboard
				frappe.set_route('cost-sheet-dashboard');
				
				frappe.show_alert({
					message: __('Loading cost sheet in dashboard...'),
					indicator: 'green'
				}, 3);
			});
			btn.addClass("btn-primary");
		}
	},
	before_workflow_action(frm) {
		if (frm.selected_workflow_action === "Reject") {
			frappe.validated = false; // pause the default workflow action

			frappe.prompt(
				[
					{
						fieldname: 'remarks',
						label: 'Rejection Remarks',
						fieldtype: 'Small Text',
						reqd: 1
					}
				],
				function(values) {
					frm.set_value('remarks', values.remarks);
					frm.save().then(() => {
						frappe.model.execute_workflow_action(
							frm.doc.doctype,
							frm.doc.name,
							frm.selected_workflow_action
						);
					});
				},
				'Enter Rejection Remarks',
				'Reject'
			);
		}
	}
});
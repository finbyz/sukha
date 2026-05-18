(() => {
	const lead_list_settings = frappe.listview_settings["Lead"] || {};

	const remove_status_columns = (listview) => {
		if (!Array.isArray(listview.columns)) return;

		listview.columns = listview.columns.filter((column) => {
			return column.type !== "Status" && column.df?.fieldname !== "status";
		});
	};

	frappe.listview_settings["Lead"] = {
		...lead_list_settings,
		onload(listview) {
			const setup_columns = listview.setup_columns.bind(listview);

			listview.setup_columns = () => {
				setup_columns();
				remove_status_columns(listview);
			};

			remove_status_columns(listview);
			lead_list_settings.onload?.(listview);
		},
	};
})();

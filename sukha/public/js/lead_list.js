(() => {
	const lead_list_settings = frappe.listview_settings["Lead"] || {};
	const lead_status_fields = [
		"custom_export_lead_status",
		"custom_l0_status",
		"custom_l1_status",
		"custom_l2_status",
		"custom_buyer_type",
	];

	const unique = (values) => [...new Set((values || []).filter(Boolean))];

	const remove_status_columns = (listview) => {
		if (!Array.isArray(listview.columns)) return;

		listview.columns = listview.columns.filter((column) => {
			return column.type !== "Status" && column.df?.fieldname !== "status";
		});
	};

	const get_lead_level_status = (doc) => {
		if (doc.custom_export_lead_status) {
			return doc.custom_export_lead_status;
		}

		if (doc.custom_l2_status === "Saved") {
			return "L2";
		}

		if (doc.custom_l1_status === "Saved") {
			return "L1";
		}

		if (doc.custom_l0_status === "Saved") {
			return "L0";
		}

		return "";
	};

	const get_lead_level_filter = (doc, level) => {
		if (doc.custom_export_lead_status) {
			return `custom_export_lead_status,=,${doc.custom_export_lead_status}`;
		}

		const status_field = {
			L0: "custom_l0_status",
			L1: "custom_l1_status",
			L2: "custom_l2_status",
		}[level];

		return status_field ? `${status_field},=,Saved` : "";
	};

	const get_lead_display_status = (doc) => {
		return [doc.custom_buyer_type, get_lead_level_status(doc)]
			.filter(Boolean)
			.join(" - ");
	};

	const get_lead_status_filter = (doc) => {
		const level = get_lead_level_status(doc);
		const filters = [
			doc.custom_buyer_type ? `custom_buyer_type,=,${doc.custom_buyer_type}` : "",
			level ? get_lead_level_filter(doc, level) : "",
		].filter(Boolean);

		if (!filters.length && doc.status) {
			filters.push(`status,=,${doc.status}`);
		}

		return filters.join("|");
	};

	const make_status_indicator = (doc) => {
		const display_status = get_lead_display_status(doc) || doc.status;

		if (!display_status) {
			return null;
		}

		const color_status = get_lead_level_status(doc) || doc.custom_buyer_type || doc.status;
		return [
			__(display_status),
			frappe.utils.guess_colour(color_status),
			get_lead_status_filter(doc),
		];
	};

	const format_status_pill = (doc) => {
		const indicator = make_status_indicator(doc);

		if (!indicator) {
			return "";
		}

		const [label, color, filter] = indicator;
		const filter_attr = filter
			? `data-filter="${frappe.utils.escape_html(filter)}"`
			: "";

		return `<span class="filterable indicator-pill ${color} ellipsis" ${filter_attr}>
			<span class="ellipsis"> ${frappe.utils.escape_html(label)} </span>
		</span>`;
	};

	frappe.listview_settings["Lead"] = {
		...lead_list_settings,
		add_fields: unique([
			...(lead_list_settings.add_fields || []),
			...lead_status_fields,
		]),
		get_indicator(doc) {
			return make_status_indicator(doc);
		},
		formatters: {
			...(lead_list_settings.formatters || {}),
			custom_export_lead_status(value, df, doc) {
				return format_status_pill(doc);
			},
		},
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



frappe.ui.form.on('Lead', {
    refresh(frm) {
        set_state_options(frm);
    },

    country(frm) {
        set_state_options(frm);
    }
});

function set_state_options(frm) {
    let field = frm.fields_dict.custom_stateprovince;

    if (!field) return;

    if (frm.doc.country === "India") {
        field.set_data(frappe.boot.india_state_options || []);
    } else {
        field.set_data([]);
    }
}
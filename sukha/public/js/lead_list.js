/* lead_list.js */

frappe.listview_settings["Lead"] = {

    get_indicator() {
        return null;
    },

    before_render() {

        // Hide Status column header
        $('[data-fieldname="status"]').hide();

        // Hide Status cells
        $('[data-col="status"]').hide();
    }
};
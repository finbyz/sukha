from frappe.model.mapper import get_mapped_doc
import frappe
from frappe.utils import flt

def on_submit(doc, method):
    """Set the status of the linked Cost Sheet to 'Quotation Submitted' when a Quotation is submitted."""
    for item in doc.items:
        if item.custom_cost_sheet:
            cost_sheet = frappe.get_doc("Cost Sheet", item.custom_cost_sheet)
            if not cost_sheet.docstatus == 1:  # Ensure the Cost Sheet is submitted
                frappe.throw(
                    f"Cannot submit Quotation because linked Cost Sheet {cost_sheet.name} is not submitted."
                )
@frappe.whitelist()
def make_quotation(source_name, target_doc=None):
    # Prevent duplicate quotation for same Cost Sheet
    existing = frappe.db.sql(
        """
        SELECT qi.parent
        FROM `tabQuotation Item` qi
        INNER JOIN `tabQuotation` q
            ON q.name = qi.parent
        WHERE qi.custom_cost_sheet = %s
          AND q.docstatus IN (0, 1)
        LIMIT 1
        """,
        (source_name,),
        as_dict=True,
    )

    if existing:
        frappe.throw(
            f"Quotation already exists: "
            f"<a href='/app/quotation/{existing[0].parent}'>{existing[0].parent}</a>"
        )

    def postprocess(source, target, source_parent=None):
        # ---------------------------------
        # Determine party
        # ---------------------------------
        quotation_to = None
        party_name = None

        if source.customer:
            quotation_to = "Customer"
            party_name = source.customer
        elif source.lead:
            quotation_to = "Lead"
            party_name = source.lead

        # ---------------------------------
        # Validate against existing quotation
        # ---------------------------------
        if target.party_name and target.party_name != party_name:
            frappe.throw(
                f"Customer/Lead mismatch.<br><br>"
                f"Quotation Party: <b>{target.party_name}</b><br>"
                f"Cost Sheet Party: <b>{party_name}</b>"
            )

        if target.incoterm and source.incoterm and target.incoterm != source.incoterm:
            frappe.throw(
                f"Incoterm mismatch.<br><br>"
                f"Quotation: <b>{target.incoterm}</b><br>"
                f"Cost Sheet: <b>{source.incoterm}</b>"
            )

        if (
            target.payment_terms_template
            and source.customer_payment_terms
            and target.payment_terms_template != source.customer_payment_terms
        ):
            frappe.throw(
                f"Payment Terms mismatch.<br><br>"
                f"Quotation: <b>{target.payment_terms_template}</b><br>"
                f"Cost Sheet: <b>{source.customer_payment_terms}</b>"
            )

        # ---------------------------------
        # Set header values
        # ---------------------------------
        if not target.party_name:
            target.quotation_to = quotation_to
            target.party_name = party_name

        if not target.company:
            target.company = source.company

        if not target.currency:
            target.currency = source.currency

        if not target.incoterm:
            target.incoterm = source.incoterm

        if not target.payment_terms_template:
            target.payment_terms_template = source.customer_payment_terms

        # ---------------------------------
        # Add Item
        # ---------------------------------
        target.append("items", {
            "item_code": source.product,
            "item_name": frappe.db.get_value("Item", source.product, "item_name") or source.product,
            "qty": flt(source.total_quantity) or flt(source.total_weight_mt) or 1,
            "uom": frappe.db.get_value("Item", source.product, "stock_uom") or "MT",
            "rate": source.final_offered_price or 0,

            "custom_cost_sheet": source.name,
            "custom_exw_subtype": source.exw_sub_type,
            "custom_packing_type": source.packing_type,
            "custom_standard_packing": source.custom_std_pakcing,
            "custom_packing_unit_size": source.packing_unit_size,
            "custom_final_country_of_destination": source.country_of_destination or source.final_country_of_destination,
        })

    return get_mapped_doc(
        "Cost Sheet",
        source_name,
        {
        "Cost Sheet": {
            "doctype": "Quotation",
            "field_no_map": ["status", "name"],
            "postprocess": postprocess,
        }
        },
        target_doc,
    )


@frappe.whitelist()
def get_used_cost_sheets():
    """Return Cost Sheets already linked to a non-cancelled Quotation via
    Quotation Item.custom_cost_sheet, so they can be excluded from the
    'Get Items From > Cost Sheet' picker."""
    used = frappe.db.sql(
        """
        SELECT DISTINCT qi.custom_cost_sheet AS cost_sheet
        FROM `tabQuotation Item` qi
        INNER JOIN `tabQuotation` q ON q.name = qi.parent
        WHERE qi.custom_cost_sheet IS NOT NULL
          AND qi.custom_cost_sheet != ''
          AND q.docstatus IN (0, 1)
        """,
        as_dict=True,
    )
    return [d.cost_sheet for d in used]



@frappe.whitelist()
def make_blanket_order(source_name, target_doc=None):
    def set_missing_values(source, target):
        target.blanket_order_type = "Selling"

        if source.quotation_to == "Customer":
            target.customer = source.party_name
            target.customer_name = source.customer_name

        target.company = source.company
        target.tc_name = source.tc_name
        target.terms = source.terms

        target.from_date = frappe.utils.today()
        target.to_date = frappe.utils.add_months(frappe.utils.today(), 12)

    def update_item(source_item, target_item, source_parent):
        target_item.item_code = source_item.item_code
        target_item.item_name = source_item.item_name
        target_item.description = source_item.description
        target_item.qty = source_item.qty
        target_item.rate = source_item.rate
        target_item.uom = source_item.uom

        target_item.custom_cost_sheet = source_item.custom_cost_sheet
        target_item.custom_exw_subtype = source_item.custom_exw_subtype
        target_item.custom_final_country_of_destination = source_item.custom_final_country_of_destination
        target_item.custom_packing_type = source_item.custom_packing_type
        target_item.custom_standard_packing = source_item.custom_standard_packing
        target_item.custom_packing_unit_size_kg = source_item.custom_packing_unit_size

    doclist = get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "Blanket Order",
                "field_no_map": ["naming_series"],
            },
            "Quotation Item": {
                "doctype": "Blanket Order Item",
                "field_no_map": ["name"],
                "postprocess": update_item,
            },
        },
        target_doc,
        set_missing_values,
    )

    return doclist
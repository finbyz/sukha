from frappe.model.mapper import get_mapped_doc
import frappe
from frappe.utils import flt


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
            "qty": flt(source.total_quantity) or flt(source.total_weight_mt) or 1,
            "uom": frappe.db.get_value("Item", source.product, "stock_uom") or "MT",
            "rate": source.final_offered_price or 0,

            "custom_cost_sheet": source.name,
            "custom_exw_subtype": source.exw_sub_type,
            "custom_packing_type": source.packing_type,
            "custom_standard_packing": source.custom_std_pakcing,
            "custom_packing_unit_size": source.packing_unit_size,
            "custom_final_country_of_destination": source.final_country_of_destination,
        })

    return get_mapped_doc(
        "Cost Sheet",
        source_name,
        {
            "Cost Sheet": {
                "doctype": "Quotation",
                "postprocess": postprocess,
            }
        },
        target_doc,
    )
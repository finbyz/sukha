import frappe
from frappe import _

@frappe.whitelist()
def create_prospect_from_opportunity(opportunity_name, lead_name, prospect_name, create_contact=False, prospect_type=None):
    """
    Create a Prospect from an Opportunity and link it with both Lead and Opportunity
    """

    opportunity = frappe.get_doc("Opportunity", opportunity_name)
    lead = frappe.get_doc("Lead", lead_name) if lead_name and frappe.db.exists("Lead", lead_name) else None

    # Removed validation - Allow multiple Prospects per Lead

    # Create Contact if requested
    if lead and frappe.utils.cint(create_contact):
        create_contact_from_lead(lead)

    # Create new Prospect
    prospect = frappe.new_doc("Prospect")

    # Make unique name if already exists
    counter = 1
    unique_name = prospect_name
    while frappe.db.exists("Prospect", {"name": unique_name}):
        unique_name = f"{prospect_name} - {counter}"
        counter += 1

    prospect.company_name = unique_name
    prospect.name = unique_name  # ✅ Force the name directly
    
    

    prospect_fields     = {f.fieldname: f for f in prospect.meta.fields}
    prospect_table_field_map = {f.fieldname: f for f in prospect.meta.get_table_fields()}
    prospect_table_fields = set(prospect_table_field_map)

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def clean_phone(value, fieldname):
        phone = frappe.utils.cstr(value).strip()
        if not phone:
            return None
        try:
            frappe.utils.validate_phone_number_with_country_code(phone, fieldname)
        except frappe.InvalidPhoneNumberError:
            return None
        return phone

    def safe_set(prospect_field, value):
        if prospect_field in prospect_table_fields:
            return
        field = prospect_fields.get(prospect_field)
        if not field or value in (None, "", [], 0):
            return
        if field.fieldtype == "Phone":
            value = clean_phone(value, prospect_field)
            if not value:
                return
        if field.fieldtype == "Link" and not frappe.db.exists(field.options, value):
            return
        if field.fieldtype == "Select" and field.options:
            options = [o for o in field.options.split("\n") if o]
            if options and value not in options:
                return
        if field.unique and frappe.db.get_value("Prospect", {prospect_field: value}, "name"):
            return
        prospect.set(prospect_field, value)

    def fill_if_empty(prospect_field, value):
        current = prospect.get(prospect_field)
        if current in (None, "", [], 0):
            safe_set(prospect_field, value)

    def copy_matching_fields(source, overwrite=False):
        for fieldname in prospect_fields:
            if fieldname.startswith("_") or fieldname in ("name", "doctype", "company_name"):
                continue
            if fieldname in prospect_table_fields:
                continue
            if not hasattr(source, fieldname):
                continue
            value = getattr(source, fieldname)
            if value in (None, "", [], 0):
                continue
            if overwrite:
                safe_set(fieldname, value)
            else:
                fill_if_empty(fieldname, value)

    # ------------------------------------------------------------------ #
    # 1. Lead fills the base (lower priority)
    # 2. Opportunity overwrites with its non-empty values (higher priority)
    # ------------------------------------------------------------------ #
    if lead:
        copy_matching_fields(lead, overwrite=True)
    copy_matching_fields(opportunity, overwrite=True)

    # ------------------------------------------------------------------ #
    # Explicit cross-field mappings (Lead → Prospect, different names)
    # ------------------------------------------------------------------ #
    if lead:
        fill_if_empty("custom_contact_number",             getattr(lead, "mobile_no", None))
        fill_if_empty("custom_contact_number",             getattr(lead, "phone", None))
        fill_if_empty("custom_product",                    getattr(lead, "custom_product_name_m", None) or getattr(lead, "custom_product_name", None))
        fill_if_empty("custom_designation",                getattr(lead, "job_title", None))
        fill_if_empty("custom_contact_person_email_id",    getattr(lead, "email_id", None))
        fill_if_empty("custom_industry_segment",           getattr(lead, "custom_industry_type", None))
        fill_if_empty("custom_approved_packing",           getattr(lead, "custom_desired_packing", None))
        fill_if_empty("custom_current_supplier",           getattr(lead, "custom_current_suppliers", None))
        fill_if_empty("custom_bill_to_party_name",         getattr(lead, "custom_bill_to_party_name", None))
        fill_if_empty("custom_bill_to_party_address",      getattr(lead, "custom_bill_to_party_address", None))
        fill_if_empty("custom_buyer_type",                 getattr(lead, "custom_buyer_type", None))
        fill_if_empty("custom_type_of_buyer",              getattr(lead, "custom_type_of_buyer", None))
        fill_if_empty("custom_end_use",                    getattr(lead, "custom_end_use", None))
        fill_if_empty("custom_preferred_communication",    getattr(lead, "custom_preferred_communication", None))
        fill_if_empty("custom_decision_role",              getattr(lead, "custom_decision_role", None) or getattr(lead, "custom_lead_type_s", None))
        fill_if_empty("custom_volume_range",               getattr(lead, "custom_volume_range", None))
        fill_if_empty("custom_tentative_requirement_mtpa", getattr(lead, "custom_tentative_requirement_mtpa", None))
        fill_if_empty("custom_country_of_hq",              getattr(lead, "custom_country_of_hq", None))
        fill_if_empty("custom_country_of_destination",     getattr(lead, "custom_country_of_destination", None))
        fill_if_empty("website",                           getattr(lead, "website", None))
        fill_if_empty("no_of_employees",                   getattr(lead, "no_of_employees", None))
        fill_if_empty("prospect_owner",                    lead.lead_owner)

    # Opportunity cross-field mappings
    fill_if_empty("custom_product",       getattr(opportunity, "custom_product_name", None))
    fill_if_empty("custom_prroduct_p",       getattr(opportunity, "custom_product_name", None))
    fill_if_empty("custom_buyer_type",    getattr(opportunity, "custom_buyer_type", None))
    fill_if_empty("custom_end_use",       getattr(opportunity, "custom_end_use", None))

    # Buyer fields on a Prospect created from Opportunity should reflect the
    # Opportunity. If Opportunity Type of Buyer is blank, don't keep stale Lead data.
    if hasattr(opportunity, "custom_buyer_type"):
        safe_set("custom_buyer_type", getattr(opportunity, "custom_buyer_type", None))
    if hasattr(opportunity, "custom_type_of_buyer"):
        opportunity_type_of_buyer = getattr(opportunity, "custom_type_of_buyer", None)
        if opportunity_type_of_buyer not in (None, "", [], 0):
            safe_set("custom_type_of_buyer", opportunity_type_of_buyer)
        elif "custom_type_of_buyer" in prospect_fields:
            prospect.set("custom_type_of_buyer", None)

    # The create buttons split Prospect creation into two business paths:
    # Qualified Lead uses Buyer Type, while L3 Prospect uses Type of Buyer.
    if prospect_type == "qualified_lead":
        safe_set("custom_buyer_type", getattr(opportunity, "custom_buyer_type", None))
    elif prospect_type == "l3":
        safe_set("custom_type_of_buyer", getattr(opportunity, "custom_type_of_buyer", None))

    # Prospect owner final fallback
    fill_if_empty("prospect_owner", opportunity.opportunity_owner)

    # ------------------------------------------------------------------ #
    # CRITICAL: Guarantee fields used in autoname / mandatory validation.
    # Walk sources in priority order and force-set if still empty.
    # ------------------------------------------------------------------ #
    critical_direct_fields = ["country", "no_of_employees", "website", "territory"]
    for fname in critical_direct_fields:
        for src in ([opportunity] + ([lead] if lead else [])):
            val = getattr(src, fname, None)
            if val not in (None, "", [], 0):
                fill_if_empty(fname, val)
                break

    # If country is STILL empty after all sources, default to company's country
    if not prospect.get("country"):
        company_country = frappe.db.get_value("Company", opportunity.company, "country")
        if company_country:
            prospect.set("country", company_country)

    # ------------------------------------------------------------------ #
    # child table: custom_bill_to_party_country
    # ------------------------------------------------------------------ #
    bill_to_country = (
        getattr(opportunity, "custom_bill_to_party_country", None)
        or (getattr(lead, "custom_bill_to_party_country", None) if lead else None)
    )
    if bill_to_country:
        if "custom_bill_to_party_country" in prospect_table_fields:
            if not prospect.get("custom_bill_to_party_country"):
                child_doctype = prospect_table_field_map["custom_bill_to_party_country"].options
                child_meta = frappe.get_meta(child_doctype)
                child_country_field = (
                    "country_name"
                    if child_meta.has_field("country_name")
                    else "country"
                    if child_meta.has_field("country")
                    else None
                )
                if child_country_field:
                    prospect.append("custom_bill_to_party_country", {child_country_field: bill_to_country})
        else:
            fill_if_empty("custom_bill_to_party_country", bill_to_country)

    # ------------------------------------------------------------------ #
    # Leads child table
    # ------------------------------------------------------------------ #
    if lead:
        lead_row = {"lead": lead.name, "lead_name": lead.lead_name}
        if lead.email_id:   lead_row["email"]      = lead.email_id
        if lead.mobile_no:  lead_row["mobile_no"]  = lead.mobile_no
        if lead.lead_owner: lead_row["lead_owner"] = lead.lead_owner
        if lead.status:     lead_row["status"]     = lead.status
        prospect.append("leads", lead_row)

    # ------------------------------------------------------------------ #
    # Opportunities child table
    # ------------------------------------------------------------------ #
    prospect.append("opportunities", {
        "opportunity":      opportunity.name,
        "amount":           opportunity.opportunity_amount,
        "stage":            opportunity.sales_stage,
        "deal_owner":       opportunity.opportunity_owner,
        "probability":      opportunity.probability,
        "expected_closing": opportunity.expected_closing,
        "currency":         opportunity.currency,
        "contact_person":   opportunity.contact_person,
    })

    # ------------------------------------------------------------------ #
    # Insert — ignore_permissions + ignore_mandatory already set,
    # but we also need ignore_validate_update_after_submit for safety.
    # ------------------------------------------------------------------ #
    prospect.flags.ignore_permissions = True
    prospect.flags.ignore_mandatory   = True
    prospect.insert()

    # Link Opportunity back — bypass ERPNext's update_prospect hook
    frappe.db.set_value(
        "Opportunity",
        opportunity.name,
        {
            "opportunity_from": "Prospect",
            "party_name":       prospect.name,
        },
        update_modified=True,
    )

    frappe.db.commit()
    return prospect.name


def create_contact_from_lead(lead):
    """Create a Contact from Lead if it doesn't exist"""

    existing_contact = frappe.db.get_value(
        "Contact",
        {
            "first_name": lead.first_name or lead.lead_name,
            "last_name":  lead.last_name,
        },
        "name",
    )
    if existing_contact:
        return existing_contact

    contact = frappe.new_doc("Contact")
    contact.first_name = lead.first_name or lead.lead_name
    if lead.last_name:    contact.last_name    = lead.last_name
    if lead.salutation:   contact.salutation   = lead.salutation
    if lead.gender:       contact.gender       = lead.gender
    if lead.job_title:    contact.designation  = lead.job_title
    if lead.company_name: contact.company_name = lead.company_name

    if lead.email_id:
        contact.append("email_ids", {"email_id": lead.email_id, "is_primary": 1})
    if lead.phone:
        contact.append("phone_nos", {"phone": lead.phone, "is_primary_phone": 1})
    if lead.mobile_no:
        contact.append("phone_nos", {"phone": lead.mobile_no, "is_primary_mobile_no": 1})

    contact.append("links", {
        "link_doctype": "Lead",
        "link_name":    lead.name,
        "link_title":   lead.lead_name,
    })

    contact.insert(ignore_permissions=True)
    contact.reload()
    return contact.name

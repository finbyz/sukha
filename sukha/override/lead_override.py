import frappe
from frappe.model.mapper import get_mapped_doc
from erpnext.crm.doctype.lead.lead import Lead, _set_missing_values
from sukha.override.opportunity_override import create_contact_from_lead

class CustomLead(Lead):
    pass


@frappe.whitelist()
def create_prospect_from_lead(lead_name, prospect_name, create_contact=False, prospect_type=None):
    """Create a Prospect from a Lead and link only the Lead."""

    lead = frappe.get_doc("Lead", lead_name)

    if frappe.utils.cint(create_contact):
        create_contact_from_lead(lead)

    prospect = frappe.new_doc("Prospect")

    counter = 1
    unique_name = prospect_name
    while frappe.db.exists("Prospect", unique_name):
        unique_name = f"{prospect_name} - {counter}"
        counter += 1

    prospect.company_name = unique_name
    prospect.name = unique_name

    prospect_fields = {field.fieldname: field for field in prospect.meta.fields}
    prospect_table_fields = {field.fieldname for field in prospect.meta.get_table_fields()}

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
            options = [option for option in field.options.split("\n") if option]
            if options and value not in options:
                return

        if field.unique and frappe.db.get_value("Prospect", {prospect_field: value}, "name"):
            return

        prospect.set(prospect_field, value)

    def fill_if_empty(prospect_field, value):
        current = prospect.get(prospect_field)
        if current in (None, "", [], 0):
            safe_set(prospect_field, value)

    def copy_matching_fields(source):
        for fieldname in prospect_fields:
            if fieldname.startswith("_") or fieldname in ("name", "doctype", "company_name"):
                continue
            if fieldname in prospect_table_fields or not hasattr(source, fieldname):
                continue

            value = getattr(source, fieldname)
            if value not in (None, "", [], 0):
                safe_set(fieldname, value)

    copy_matching_fields(lead)

    fill_if_empty("custom_contact_number", getattr(lead, "mobile_no", None))
    fill_if_empty("custom_contact_number", getattr(lead, "phone", None))
    fill_if_empty(
        "custom_product",
        getattr(lead, "custom_product_name_m", None) or getattr(lead, "custom_product_name", None),
    )
    fill_if_empty("custom_prroduct_p", getattr(lead, "custom_product_name", None))
    fill_if_empty("custom_designation", getattr(lead, "job_title", None))
    fill_if_empty("industry", getattr(lead, "custom_industry_type", None))
    fill_if_empty("custom_contact_person_for_active_inquery",getattr(lead,"custom_contact_person", None))
    fill_if_empty("custom_contact_person_email_id", getattr(lead, "email_id", None))
    fill_if_empty("custom_industry_segment", getattr(lead, "custom_industry_type", None))
    fill_if_empty("custom_approved_packing", getattr(lead, "custom_desired_packing", None))
    fill_if_empty("custom_current_supplier", getattr(lead, "custom_current_suppliers", None))
    fill_if_empty("custom_bill_to_party_name", getattr(lead, "custom_bill_to_party_name", None))
    fill_if_empty("custom_bill_to_party_address", getattr(lead, "custom_bill_to_party_address", None))
    fill_if_empty("custom_buyer_type", getattr(lead, "custom_buyer_type", None))
    fill_if_empty("custom_type_of_buyer", getattr(lead, "custom_type_of_buyer", None))
    fill_if_empty("custom_end_use", getattr(lead, "custom_end_use", None))
    fill_if_empty("custom_preferred_communication", getattr(lead, "custom_preferred_communication", None))
    fill_if_empty(
        "custom_decision_role",
        getattr(lead, "custom_decision_role", None) or getattr(lead, "custom_lead_type_s", None),
    )
    fill_if_empty("custom_volume_range", getattr(lead, "custom_volume_range", None))
    fill_if_empty("custom_tentative_requirement_mtpa", getattr(lead, "custom_tentative_requirement_mtpa", None))
    fill_if_empty("custom_country_of_hq", getattr(lead, "custom_country_of_hq", None))
    fill_if_empty("custom_country_of_destination", getattr(lead, "custom_country_of_destination", None))
    fill_if_empty("custom_bill_to_party_country", getattr(lead, "custom_bill_to_party_country", None))
    fill_if_empty("website", getattr(lead, "website", None))
    fill_if_empty("no_of_employees", getattr(lead, "no_of_employees", None))
    fill_if_empty("prospect_owner", getattr(lead, "lead_owner", None))

    if prospect_type == "qualified_lead":
        safe_set("custom_buyer_type", getattr(lead, "custom_buyer_type", None))
    elif prospect_type == "l3":
        safe_set("custom_type_of_buyer", getattr(lead, "custom_type_of_buyer", None))

    default_company = (
        getattr(lead, "company", None)
        or frappe.defaults.get_user_default("Company")
        or frappe.defaults.get_global_default("company")
    )
    fill_if_empty("company", default_company)

    if not prospect.get("country") and default_company:
        company_country = frappe.db.get_value("Company", default_company, "country")
        if company_country:
            safe_set("country", company_country)

    lead_row = {"lead": lead.name, "lead_name": lead.lead_name}
    if lead.email_id:
        lead_row["email"] = lead.email_id
    if lead.mobile_no:
        lead_row["mobile_no"] = lead.mobile_no
    if lead.lead_owner:
        lead_row["lead_owner"] = lead.lead_owner
    if lead.status:
        lead_row["status"] = lead.status
    prospect.append("leads", lead_row)

    prospect.flags.ignore_permissions = True
    prospect.flags.ignore_mandatory = True
    prospect.insert()

    frappe.db.commit()
    return prospect.name

@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):
    """Create Opportunity from Lead with custom field mapping"""
    
    def set_missing_values(source, target):
        _set_missing_values(source, target)
    
    # Map standard fields from Lead to Opportunity
    target_doc = get_mapped_doc(
        "Lead",
        source_name,
        {
            "Lead": {
                "doctype": "Opportunity",
                "field_map": {
                    "doctype": "opportunity_from",
                    "name": "party_name",
                    "lead_name": "contact_display",
                    "company_name": "customer_name",
                    "email_id": "contact_email",
                    "mobile_no": "contact_mobile",
                    "lead_owner": "opportunity_owner",
                    "notes": "notes",
                },
            }
        },
        target_doc,
        set_missing_values,
    )
    
    # Get the source lead document
    lead = frappe.get_doc("Lead", source_name)
    
    # Map all custom fields from Lead to Opportunity
    custom_fields_to_map = [
        "custom_country_of_destination",
        "custom_sales_type",
        "custom_type_of_buyer",
        "custom_buyer_type",
        "custom_volume_range",
        "custom_volume_range_assumption",
        "custom_source_of_the_lead",
        "custom_specific_inquiry_source",
        "custom_existing_buying_regioncountry",
        "custom_regulatory_requirements",
        "custom_preferred_communication",
        "custom_contact_person_for_active_inquery",
        "custom_contact_person_contracted_via",
        "custom_employee_size_on_linkedin",
        "custom_linkedin",
        "custom_website_a",
        "custom_inquiry_type",
        "custom_inquiry_source",
        "custom_packing_type_with_unit_sizekg",
        "custom_container_type",
        "custom_total_qty_inquired",
        "custom_max_qty_in_container",
        "custom_total_no_of_ccontainers",
        "custom_incoterm",
        "custom_preferred_shipping_line",
        "custom_customer_payment_term"
    ]
    
    # Copy custom field values
    for field in custom_fields_to_map:
        if hasattr(lead, field) and getattr(lead, field):
            setattr(target_doc, field, getattr(lead, field))
            
    # Explicit custom field mappings from Lead to Opportunity
    if hasattr(lead, "custom_desired_payment_terms") and lead.custom_desired_payment_terms:
        target_doc.custom_customer_desired_payment_terms = lead.custom_desired_payment_terms
        
    if hasattr(lead, "custom_desired_incoterm") and lead.custom_desired_incoterm:
        target_doc.custom_incoterm = lead.custom_desired_incoterm
        
    if hasattr(lead, "custom_current_suppliers") and lead.custom_current_suppliers:
        target_doc.custom_preferred_supplier = lead.custom_current_suppliers
    
    # Set transaction date to today if not set
    if not target_doc.transaction_date:
        target_doc.transaction_date = frappe.utils.today()
        
    target_doc.custom_posting_date = frappe.utils.today()
    
    # Set opportunity type based on sales type
    if lead.custom_sales_type == "Direct Export Sales":
        target_doc.opportunity_type = "Soft Inquiry - Export"

    if lead.custom_sales_type == "Direct Export Sales":
        product_name = (
            getattr(lead, "custom_product_name_m", None)
            or getattr(lead, "custom_product_name", None)
        )
    elif lead.custom_sales_type == "Domestic / Merchant":
        product_name = (
            getattr(lead, "custom_product_name", None)
            or getattr(lead, "custom_product_name_m", None)
        )
    else:
        product_name = (
            getattr(lead, "custom_product_name", None)
            or getattr(lead, "custom_product_name_m", None)
        )

    if product_name:
        target_doc.custom_product_name = product_name
    
    if lead.custom_bill_to_party_name:
        target_doc.customer_name = lead.custom_bill_to_party_name
        
    if lead.custom_bill_to_party_country:
        target_doc.custom_country_of_destination = lead.custom_bill_to_party_country
    
    return target_doc


@frappe.whitelist()
def create_opportunity_with_buyer_type(lead_name, buyer_type=None, sales_type=None):
    """Create Opportunity from Lead with buyer type and sales type"""
    
    opportunity = make_opportunity(lead_name)
    # Set custom buyer type if provided
    if buyer_type:
        opportunity.custom_buyer_type = buyer_type
    
    # Set opportunity type for Domestic/Merchant leads
    if sales_type == "Domestic / Merchant":
        if buyer_type:
            opportunity.custom_buyer_type = buyer_type
        if opportunity.custom_buyer_type == "Merchant":
            opportunity.opportunity_type = "Soft Inquiry - Merchant"
        elif opportunity.custom_buyer_type == "Domestic":
            opportunity.opportunity_type = "Soft Inquiry - Domestic"
        else:
            opportunity.opportunity_type = "Soft Inquiry - Export"

    # Insert the opportunity
    opportunity.insert(ignore_mandatory=sales_type == "Domestic / Merchant")
    
    return opportunity.name

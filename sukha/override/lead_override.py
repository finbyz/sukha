import frappe
from frappe.model.mapper import get_mapped_doc
from erpnext.crm.doctype.lead.lead import Lead, _set_missing_values

class CustomLead(Lead):
    pass

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
    
    # Set transaction date to today if not set
    if not target_doc.transaction_date:
        target_doc.transaction_date = frappe.utils.today()
        
    target_doc.custom_posting_date = frappe.utils.today()
    
    # Set opportunity type based on sales type
    if lead.custom_sales_type == "Direct Export Sales":
        target_doc.opportunity_type = "Soft Enquiry - Export"

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
            opportunity.opportunity_type = "Soft Enquiry - Merchant"
        elif opportunity.custom_buyer_type == "Domestic":
            opportunity.opportunity_type = "Soft Enquiry - Domestic"
        else:
            opportunity.opportunity_type = "Soft Enquiry - Export"

    # Insert the opportunity
    opportunity.insert(ignore_mandatory=sales_type == "Domestic / Merchant")
    
    return opportunity.name

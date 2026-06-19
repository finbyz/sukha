import frappe
from frappe.model.mapper import get_mapped_doc
from erpnext.crm.doctype.lead.lead import Lead, _set_missing_values
from sukha.override.opportunity_override import create_contact_from_lead

class CustomLead(Lead):
    def before_insert(self):
        # Match or create contact first so we populate custom_contact_person
        self.match_or_create_contact()

        if getattr(self, "custom_contact_person", None):
            self.contact_doc = frappe.get_doc("Contact", self.custom_contact_person)
            if self.lead_name and not any([self.first_name, self.middle_name, self.last_name]):
                from erpnext.selling.doctype.customer.customer import parse_full_name
                self.first_name, self.middle_name, self.last_name = parse_full_name(self.lead_name)
            return
        super().before_insert()

    def validate(self):
        self.match_or_create_contact()
        super().validate()

    def match_or_create_contact(self):
        # We only match/create contact if email or phone is provided
        email = getattr(self, "custom_central_email_id", None)
        phone = getattr(self, "custom_board__number", None)
        country = getattr(self, "custom_country_of_hq", None)

        if not email and not phone:
            return

        # Check if the values actually changed, or if it's a new document
        is_changed = False
        if self.is_new():
            is_changed = True
        else:
            db_values = frappe.db.get_value(
                "Lead",
                self.name,
                ["custom_central_email_id", "custom_board__number", "custom_country_of_hq"],
                as_dict=True
            )
            if db_values:
                if (email != db_values.custom_central_email_id or 
                    phone != db_values.custom_board__number or 
                    country != db_values.custom_country_of_hq):
                    is_changed = True

        # If custom_contact_person is already set but values changed, we might need to check/re-link
        if not getattr(self, "custom_contact_person", None):
            is_changed = True

        if not is_changed:
            return

        # Search for existing contact
        contact_name = self.find_existing_contact(email, phone)

        if contact_name:
            # Match found! Link to it
            self.custom_contact_person = contact_name
            self.custom_contact_person_for_soft_inquiry = contact_name
            
            # Fetch details from the contact and populate Lead fields
            contact_doc = frappe.get_doc("Contact", contact_name)
            
            # Fetch phone/mobile
            contact_phone = None
            if contact_doc.phone_nos:
                primary_phone = next((p for p in contact_doc.phone_nos if p.is_primary_phone or p.is_primary_mobile_no), None)
                if primary_phone:
                    contact_phone = primary_phone.custom_contact_number or primary_phone.phone
                else:
                    contact_phone = contact_doc.phone_nos[0].custom_contact_number or contact_doc.phone_nos[0].phone
            
            if contact_phone:
                self.custom_contact_person_phone_number = contact_phone
            elif contact_doc.phone:
                self.custom_contact_person_phone_number = contact_doc.phone
            elif contact_doc.mobile_no:
                self.custom_contact_person_phone_number = contact_doc.mobile_no

            # Fetch email
            contact_email = None
            if contact_doc.email_ids:
                primary_email = next((e for e in contact_doc.email_ids if e.is_primary), None)
                if primary_email:
                    contact_email = primary_email.email_id
                else:
                    contact_email = contact_doc.email_ids[0].email_id
            
            if contact_email:
                self.custom_contact_person_phone_email_id = contact_email
            elif contact_doc.email_id:
                self.custom_contact_person_phone_email_id = contact_doc.email_id

            # Fetch designation and country
            if contact_doc.designation:
                self.custom_contact_person_designation__department = contact_doc.designation
            if contact_doc.get("custom_country"):
                self.custom_bill_to_party_country = contact_doc.custom_country
            if contact_doc.custom_visiting_card_attachment:
                self.custom_attachment_ = contact_doc.custom_visiting_card_attachment

            # Ensure Dynamic Link exists (if Lead is already saved)
            if not self.is_new():
                self.create_dynamic_link_if_not_exists(contact_name)
        else:
            # Create a new Contact!
            contact = frappe.new_doc("Contact")
            # Set name of contact as Company Name or Lead Name or Default
            first_name = self.company_name or self.lead_name or "Contact Person"
            if first_name.strip().lower() == "contact":
                first_name = "Contact Person"
            contact.first_name = first_name
            contact.custom_country = country
            if email:
                contact.append("email_ids", {"email_id": email, "is_primary": 1})
            if phone:
                contact.append("phone_nos", {
                    "phone": phone,
                    "custom_contact_number": phone,
                    "is_primary_phone": 1,
                    "is_primary_mobile_no": 1
                })
            contact.insert(ignore_permissions=True)
            contact_name = contact.name

            self.custom_contact_person = contact_name
            self.custom_contact_person_for_soft_inquiry = contact_name
            self.custom_contact_person_phone_number = phone
            self.custom_contact_person_phone_email_id = email
            if country:
                self.custom_bill_to_party_country = country

            if not self.is_new():
                self.create_dynamic_link_if_not_exists(contact_name)

    def find_existing_contact(self, email=None, phone=None):
        if email:
            contact_name = frappe.db.get_value("Contact Email", {"email_id": email}, "parent")
            if contact_name:
                return contact_name
        if phone:
            contact_name = frappe.db.get_value("Contact Phone", {"phone": phone}, "parent")
            if contact_name:
                return contact_name
            contact_name = frappe.db.get_value("Contact Phone", {"custom_contact_number": phone}, "parent")
            if contact_name:
                return contact_name
        return None

    def create_dynamic_link_if_not_exists(self, contact_name):
        # If we are linking to a new contact, we should remove the link from the old contact
        if not self.is_new():
            old_contact = frappe.db.get_value("Lead", self.name, "custom_contact_person")
            if old_contact and old_contact != contact_name:
                frappe.db.delete("Dynamic Link", {
                    "parent": old_contact,
                    "link_doctype": "Lead",
                    "link_name": self.name
                })
                frappe.clear_document_cache("Contact", old_contact)

        exists = frappe.db.exists("Dynamic Link", {
            "parent": contact_name,
            "parenttype": "Contact",
            "parentfield": "links",
            "link_doctype": "Lead",
            "link_name": self.name
        })
        if not exists:
            link = frappe.new_doc("Dynamic Link")
            link.parent = contact_name
            link.parenttype = "Contact"
            link.parentfield = "links"
            link.link_doctype = "Lead"
            link.link_name = self.name
            link.link_title = self.lead_name or self.company_name or self.name
            link.insert(ignore_permissions=True)
            frappe.clear_document_cache("Contact", contact_name)

    def check_email_id_is_unique(self):
        if self.email_id:
            if not frappe.db.get_single_value("CRM Settings", "allow_lead_duplication_based_on_emails"):
                filters = {"email_id": self.email_id, "name": ["!=", self.name]}
                if getattr(self, "custom_contact_person", None):
                    filters["custom_contact_person"] = ["!=", self.custom_contact_person]

                duplicate_leads = frappe.get_all("Lead", filters=filters)
                if duplicate_leads:
                    from frappe.utils import comma_and, get_link_to_form
                    from frappe import _
                    duplicate_leads = [
                        frappe.bold(get_link_to_form("Lead", lead.name)) for lead in duplicate_leads
                    ]
                    frappe.throw(
                        _("Email Address must be unique, it is already used in {0}").format(
                            comma_and(duplicate_leads)
                        ),
                        frappe.DuplicateEntryError,
                    )

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
            if fieldname.startswith("_") or fieldname in ("name", "doctype", "company_name", "custom_product_name"):
                continue
            if fieldname in prospect_table_fields or not hasattr(source, fieldname):
                continue

            value = getattr(source, fieldname)
            if value not in (None, "", [], 0):
                safe_set(fieldname, value)

    copy_matching_fields(lead)

    fill_if_empty("custom_contact_number", getattr(lead, "mobile_no", None))
    fill_if_empty("custom_contact_number", getattr(lead, "phone", None))
    # Force product mapping

    prospect.custom_product_name = ""
    prospect.custom_prroduct_p = ""

    if lead.custom_sales_type == "Direct Export Sales":
        product_name = lead.custom_product_from_l1

    else:
        product_name = lead.custom_product_name_m

    if product_name:
        prospect.custom_product_name = product_name
        prospect.custom_prroduct_p = product_name
    fill_if_empty("custom_item_name_2", getattr(lead, "custom_product_name_i", None))
    fill_if_empty("custom_company_name_f", getattr(lead, "company_name", None))
    fill_if_empty("custom_approved_incoterms", getattr(lead, "custom_desired_incoterm", None))
    fill_if_empty("custom_bill_to_party_contact", getattr(lead, "custom_contact_person", None))
    fill_if_empty("custom_approved_payment_terms", getattr(lead, "custom_desired_payment_terms", None))
    fill_if_empty("custom_designation", getattr(lead, "job_title", None))
    fill_if_empty("custom_notes_p", getattr(lead, "custom_notes_p", None))
    fill_if_empty("industry", getattr(lead, "custom_industry_type", None))
    fill_if_empty("custom_contact_person_for_active_inquery",getattr(lead,"custom_contact_person", None))
    fill_if_empty("custom_contact_person_email_id", getattr(lead, "email_id", None))
    fill_if_empty(
        "custom_industry_segment",
        getattr(lead, "industry", None) or getattr(lead, "custom_industry_type", None),
    )
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
    
    full_name = getattr(lead, "full_name", None)
    if not full_name:
        full_name = getattr(lead, "lead_name", None)
    
    if full_name:
        fill_if_empty("custom_contact_person_for_soft_inquiry_b", full_name)
    
    # Map 2: mobile_no to custom_contact_number (PHONE ONLY)
    mobile_no = getattr(lead, "mobile_no", None)
    if not mobile_no:
        # Fallback to phone field if mobile_no is empty
        mobile_no = getattr(lead, "phone", None)
    
    # Also try to get from Contact if linked
    if not mobile_no and getattr(lead, "custom_contact_person", None):
        try:
            contact = frappe.get_doc("Contact", lead.custom_contact_person)
            if contact.phone:
                mobile_no = contact.phone
            elif contact.mobile_no:
                mobile_no = contact.mobile_no
            elif contact.phone_nos:
                for phone_entry in contact.phone_nos:
                    if phone_entry.is_primary_phone or phone_entry.is_primary_mobile_no:
                        mobile_no = phone_entry.phone or phone_entry.custom_contact_number
                        break
                if not mobile_no:
                    mobile_no = contact.phone_nos[0].phone or contact.phone_nos[0].custom_contact_number
        except Exception as e:
            frappe.logger().warning(f"Could not fetch phone from contact: {str(e)}")
    
    if mobile_no:
        fill_if_empty("custom_contact_number_d", mobile_no)
    
    # Map 3: email_id to custom_designation_e (EMAIL ONLY)
    email_id = getattr(lead, "email_id", None)
    if email_id:
        fill_if_empty("custom_contact_person_emaiil_id_c", email_id)

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
                    "custom_contact_person":"custom_contact_person_for_soft_inquiry",
                },
            }
        },
        target_doc,
        set_missing_values,
    )
    
    # Get the source lead document
    lead = frappe.get_doc("Lead", source_name)
    target_doc.custom_contact_person  = lead.custom_contact_person_for_soft_inquiry
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
        product_name = getattr(lead, "custom_product_from_l1", None)

    elif lead.custom_sales_type == "Domestic / Merchant":
        product_name = getattr(lead, "custom_product_name_m", None)

    else:
        product_name = (
        getattr(lead, "custom_product_from_l1", None)
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

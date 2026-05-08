import frappe
import json

@frappe.whitelist()
def create_prospect_and_contact(docname, data):
    doc = frappe.get_doc("Lead", docname)
    data = frappe._dict(json.loads(data))

    if data.create_contact:
        create_contact(doc)

    if data.create_prospect:
        create_prospect(doc, data.prospect_name)


@frappe.whitelist()
def create_contact_from_dialog(first_name, last_name=None, designation=None, gender=None, email_id=None, phone=None):
    """Create a Contact from dialog form data"""
    contact = frappe.new_doc("Contact")
    contact.update(
        {
            "first_name": first_name,
            "last_name": last_name,
            "designation": designation,
            "gender": gender,
        }
    )

    if email_id:
        contact.append("email_ids", {"email_id": email_id, "is_primary": 1})

    if phone:
        contact.append("phone_nos", {"phone": phone, "is_primary_phone": 1, "is_primary_mobile_no": 1})

    contact.flags.ignore_permissions = True
    contact.insert()
    return contact.name

		
def create_contact(self):
		if not self.lead_name:
			self.set_full_name()
			self.set_lead_name()

		contact = frappe.new_doc("Contact")
		contact.update(
			{
				"first_name": self.first_name or self.lead_name,
				"last_name": self.last_name,
				"salutation": self.salutation,
				"gender": self.gender,
				"designation": self.job_title,
				"company_name": self.company_name,
			}
		)

		if self.email_id:
			contact.append("email_ids", {"email_id": self.email_id, "is_primary": 1})

		if self.phone:
			contact.append("phone_nos", {"phone": self.phone, "is_primary_phone": 1})

		if self.mobile_no:
			contact.append("phone_nos", {"phone": self.mobile_no, "is_primary_mobile_no": 1})

		contact.insert(ignore_permissions=True)
		contact.reload()  # load changes by hooks on contact

		return contact

def create_prospect(self, company_name):
    try:
        prospect = frappe.new_doc("Prospect")
        prospect.company_name = company_name or self.company_name or ''
        prospect.no_of_employees = self.no_of_employees or ''
        prospect.industry = self.industry or ''
        prospect.market_segment = self.market_segment or ''
        prospect.custom_contact_number = self.custom_contact_person_phone_number or ''
        prospect.custom_product = self.custom_product_name or ''
        prospect.custom_designation = self.custom_designation or ''
        prospect.custom_contact_person_email_id = self.custom_contact_person_email_id or ''
        prospect.custom_industry_segment = self.custom_industry_type or ''
        prospect.custom_approved_packing = self.custom_desired_packing or ''
        prospect.custom_existing_buying_regioncountry = self.custom_existing_buying_regioncountry or ''
        prospect.custom_current_supplier = self.custom_current_suppliers or ''
        prospect.custom_bill_to_party_name = self.custom_bill_to_party_name or ''
        prospect.custom_bill_to_party_address = self.custom_bill_to_party_address or ''
        # prospect.custom_type_of_buyer = self.custom_type_of_buyer or ''
        # prospect.custom_approved_country_of_destinations = self.custom_country_of_destination or ''
        # prospect.custom_approved_port_of_destinations = self.custom_port_of_destination or ''
        prospect.annual_revenue = self.annual_revenue
        prospect.territory = self.territory
        prospect.fax = self.fax
        prospect.website = self.website
        prospect.prospect_owner = self.lead_owner
        prospect.company = self.company
        prospect.notes = self.notes
        
        prospect_lead = prospect.append("leads", {})
        prospect_lead.lead = self.name
        prospect_lead.lead_name = self.lead_name
        prospect_lead.email = self.email_id
        prospect_lead.mobile_no = self.mobile_no
        prospect_lead.lead_owner = self.lead_owner
        prospect_lead.status = self.status
        
        prospect.flags.ignore_permissions = True
        prospect.flags.ignore_mandatory = True
        prospect.save()
        
    except frappe.DuplicateEntryError:
        frappe.throw(_("Prospect {0} already exists").format(company_name or self.company_name))


def before_save(doc, method=None):
    if not doc.opportunities:
        return
    
    for opportunity_row in doc.opportunities:
        if opportunity_row.opportunity:
            try:
                frappe.db.set_value(
                    "Opportunity", 
                    opportunity_row.opportunity, 
                    "opportunity_type", 
                    "Active Enquiry"
                )
            except Exception as e:
                frappe.log_error(
                    message=f"Error updating opportunity {opportunity_row.opportunity}: {str(e)}",
                    title="Prospect Submit - Opportunity Update Failed"
                )
import frappe
import re

def validate(self, method):
	for row in self.phone_nos:
		val = row.phone or row.custom_contact_number
		if val:
			val = val.strip()
			if not val.startswith("+"):
				digits = re.sub(r"\D", "", val)
				if len(digits) == 10:
					val = "+91" + digits
				elif len(digits) == 11 and digits.startswith("0"):
					val = "+91" + digits[1:]
				elif len(digits) == 12 and digits.startswith("91"):
					val = "+" + digits
				elif len(digits) > 0:
					val = "+91" + digits
			row.phone = val
			row.custom_contact_number = val

def on_update(doc, method):
    # doc is a Contact
    
    # 1. Gather contact details
    phone = doc.phone or doc.mobile_no
    if not phone and doc.get("phone_nos"):
        for p in doc.phone_nos:
            if p.is_primary_phone or p.is_primary_mobile_no:
                phone = p.phone or p.custom_contact_number
                break
        if not phone and doc.phone_nos:
            phone = doc.phone_nos[0].phone or doc.phone_nos[0].custom_contact_number
            
    email = doc.email_id
    if not email and doc.get("email_ids"):
        for e in doc.email_ids:
            if e.is_primary:
                email = e.email_id
                break
        if not email and doc.email_ids:
            email = doc.email_ids[0].email_id
            
    designation = doc.designation
    attachment = doc.get("custom_visiting_card_attachment")
    
    # 2. Iterate linked Leads and update them
    for link in doc.links:
        if link.link_doctype == "Lead":
            lead_name = link.link_name
            if frappe.db.exists("Lead", lead_name):
                lead = frappe.get_doc("Lead", lead_name)
                
                # Check if we need to update
                changed = False
                
                if lead.custom_contact_person != doc.name:
                    lead.custom_contact_person = doc.name
                    changed = True
                    
                if lead.custom_contact_person_for_soft_inquiry != doc.name:
                    lead.custom_contact_person_for_soft_inquiry = doc.name
                    changed = True
                    
                if lead.custom_contact_person_phone_number != phone:
                    lead.custom_contact_person_phone_number = phone
                    changed = True
                    
                if lead.custom_contact_person_phone_email_id != email:
                    lead.custom_contact_person_phone_email_id = email
                    changed = True
                    
                if lead.custom_contact_person_designation__department != designation:
                    lead.custom_contact_person_designation__department = designation
                    changed = True
                    
                if lead.custom_attachment_ != attachment:
                    lead.custom_attachment_ = attachment
                    changed = True
                    
                if changed:
                    try:
                        lead.flags.ignore_permissions = True
                        lead.flags.ignore_mandatory = True
                        lead.save()
                    except Exception as e:
                        frappe.log_error(
                            message=f"Failed to sync contact details to Lead {lead_name}: {str(e)}",
                            title="Contact Hook - Sync to Lead Failed"
                        )


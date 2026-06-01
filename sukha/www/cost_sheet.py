import frappe
from frappe import _

no_cache = 1

def get_context(context):
	"""
	Context for Cost Sheet HTML page
	"""
	context.no_cache = 1
	
	# Check if user is logged in
	if frappe.session.user == "Guest":
		frappe.throw(_("You need to be logged in to access this page"), frappe.PermissionError)
	
	# Add Frappe boot data for JavaScript
	context.boot = frappe.sessions.get()
	
	# Add CSRF token
	context.csrf_token = frappe.sessions.get_csrf_token()
	
	return context

# Cost Sheet Dashboard

## Overview

The Cost Sheet Dashboard is a comprehensive, interactive page for creating and managing cost sheets in the Sukha App. It provides a user-friendly interface with real-time calculations, multiple incoterm support, and seamless integration with the Cost Sheet DocType.

## Features

### 1. **Master Cost Sheet Variant Selection**
- **Incoterm Selection**: CIF, FOB, EXW
- **Origin Scope**: India (Local Sourcing) or TC (Third Country Sourcing)
- **EXW Sub-Types**: Domestic Sale, Merchant Export, Repacking Service

### 2. **Trade Schemes**
- RoDTEP Scheme Rebate (Standard Claim)
- Advance Licensing Scheme (AA-DFIA Duty Waiver)
- Mutually exclusive checkbox selection

### 3. **Real-Time Calculations**
- Automatic calculation of costs based on inputs
- Exchange rate management with premium
- Container and weight calculations
- Margin analysis with profit percentage

### 4. **KPI Dashboard**
- Live display of key metrics:
  - Scope (Cost Sheet Type)
  - Total Weight (MT)
  - Target Base Cost
  - Offered Price
  - Profit Margin %

### 5. **Integration with Cost Sheet DocType**
- Save directly to Cost Sheet DocType
- Load existing cost sheets for editing
- Automatic field mapping and validation

## How to Access

1. Navigate to: **Desk → Sukha → Cost Sheet Dashboard**
2. Or use the search bar: Type "Cost Sheet Dashboard"
3. Or via URL: `/app/cost-sheet-dashboard`

## How to Use

### Creating a New Cost Sheet

1. **Select Master Variant**:
   - Choose Base Incoterm (CIF/FOB/EXW)
   - Select Origin Scope (India/TC)
   - If EXW, select Sub-Type

2. **Configure Trade Schemes** (if applicable):
   - Check RoDTEP for standard rebate
   - Check Advance License for AA-DFIA waiver
   - Note: Only one can be active at a time

3. **Enter Cost Details**:
   - Product information
   - Container and packing details
   - Exchange rates
   - Logistics information

4. **Review KPI Banner**:
   - Monitor real-time calculations
   - Check profit margins
   - Verify total weight and costs

5. **Save Cost Sheet**:
   - Click "Save Cost Sheet" button in the top bar
   - System will create a new Cost Sheet record
   - You'll be redirected to the Cost Sheet form

### Loading an Existing Cost Sheet

1. Click the menu icon (⋮) in the top bar
2. Select "Load Existing"
3. Choose a cost sheet from the list
4. System will redirect to the Cost Sheet form

### Starting Fresh

1. Click the menu icon (⋮) in the top bar
2. Select "New Cost Sheet"
3. Form will reset to default values

## Cost Sheet Variants

### India-CIF
- **Use Case**: Direct export from India with full logistics
- **Includes**: Product cost + C&F charges + Sea freight
- **Currency**: USD for pricing

### India-FOB
- **Use Case**: Direct export from India, buyer arranges freight
- **Includes**: Product cost + C&F charges
- **Currency**: USD for pricing

### India-EXW (Domestic)
- **Use Case**: Domestic sale within India
- **Includes**: Product cost + local delivery
- **Currency**: INR for pricing

### India-EXW (Merchant Export)
- **Use Case**: Merchant export scenario
- **Includes**: Product cost + export documentation
- **Currency**: INR for pricing

### India-EXW (Repacking Service)
- **Use Case**: Repacking and relabeling services
- **Includes**: Repacking costs + QC charges
- **Currency**: INR for pricing

### TC-FOB
- **Use Case**: Third country sourcing, FOB terms
- **Includes**: TC buy cost + Sea freight
- **Currency**: USD for pricing

### TC-CIF
- **Use Case**: Third country sourcing, CIF terms
- **Includes**: TC buy cost (freight included)
- **Currency**: USD for pricing

## Field Mapping to Cost Sheet DocType

The dashboard automatically maps fields to the Cost Sheet DocType:

| Dashboard Field | DocType Field |
|----------------|---------------|
| Base Incoterm | `incoterm` |
| Origin Scope | `origin_scope` |
| Cost Sheet Type | `cost_sheet_type` |
| Type of Sale | `type_of_sale` |
| EXW Sub-Type | `exw_sub_type` |
| RoDTEP Checkbox | `apply_rodtep` |
| Advance License | `apply_advance_license` |

## Calculation Logic

### Exchange Rate
```
Effective Exchange Rate = Base Exchange Rate + Exchange Premium
```

### Container Calculations
```
Quantity per FCL (MT) = (Units per FCL × Packing Unit Size) / 1000
Total Quantity (MT) = Quantity per FCL × Total FCL
```

### Credit Cost
```
Credit Cost % = (Credit Days / 30) × 1%
Credit Cost Amount = Base Cost × Credit Cost %
```

### Profit Margin
```
Profit Amount = Offered Price - Net Cost
Profit Margin % = (Profit Amount / Offered Price) × 100
```

## Technical Details

### Files Structure
```
apps/sukha/sukha/sukha/page/cost_sheet_dashboard/
├── cost_sheet_dashboard.js      # Main JavaScript controller
├── cost_sheet_dashboard.json    # Page metadata
└── README.md                     # This file
```

### JavaScript Class: `CostSheetDashboard`

**Methods**:
- `constructor(wrapper)` - Initialize the page
- `setup_page()` - Setup page actions and menu
- `render_html()` - Render the HTML template
- `attach_styles()` - Attach CSS styles
- `initialize_engine()` - Initialize calculation engine
- `deriveMasterVariantFromFields()` - Derive variant from user selections
- `applyScopeLogic()` - Apply visibility and logic based on variant
- `save_cost_sheet()` - Save data to Cost Sheet DocType
- `collect_form_data()` - Collect form data for saving
- `reset_form()` - Reset form to defaults
- `show_cost_sheet_selector()` - Show dialog to select existing cost sheet

### Python API Method

**Method**: `sukha.sukha.doctype.cost_sheet.cost_sheet.create_from_dashboard`

**Parameters**:
- `data` (dict): Form data from the dashboard

**Returns**:
- `str`: Name of the created/updated Cost Sheet

## Customization

### Adding New Fields

1. **Update HTML Template** in `cost_sheet_dashboard.js`:
```javascript
get_html_template() {
    return `
        <!-- Add your new field HTML here -->
        <input type="text" id="my_new_field" />
    `;
}
```

2. **Update Data Collection** in `collect_form_data()`:
```javascript
collect_form_data() {
    return {
        // ... existing fields
        my_new_field: $('#my_new_field').val()
    };
}
```

3. **Update Python Method** in `cost_sheet.py`:
```python
if data.get("my_new_field"):
    doc.my_new_field = data.get("my_new_field")
```

### Adding New Calculations

Add calculation logic in the `calculateEngine()` method or create new methods in the `CostSheetDashboard` class.

## Troubleshooting

### Issue: Page not loading
**Solution**: Clear browser cache and reload. Check browser console for errors.

### Issue: Save button not working
**Solution**: Check if all required fields are filled. Check browser console for API errors.

### Issue: Calculations not updating
**Solution**: Ensure all input fields have proper `onchange` or `oninput` event handlers.

### Issue: Styles not applying
**Solution**: Check if the style element is being created in `attach_styles()` method.

## Future Enhancements

- [ ] Add more cost sheet variants
- [ ] Implement bulk import from Excel
- [ ] Add cost comparison feature
- [ ] Implement approval workflow integration
- [ ] Add PDF export functionality
- [ ] Implement cost sheet templates
- [ ] Add historical cost tracking
- [ ] Implement currency conversion API integration

## Support

For issues or questions, please contact the Sukha App development team or create an issue in the project repository.

## License

Copyright (c) 2026, Finbyz Tech

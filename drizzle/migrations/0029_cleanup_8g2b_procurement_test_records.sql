delete from inventory_stock_movements where purchase_order_id in (select id from purchase_orders where supplier_id = (select id from restaurant_suppliers where name = '8G2B Test Foods'));
update inventory_items set current_quantity = 2, unit_cost = null where id = '7927689d-63e8-496c-b2ea-ef601c5294c1';
delete from purchase_order_history where purchase_order_id in (select id from purchase_orders where supplier_id = (select id from restaurant_suppliers where name = '8G2B Test Foods'));
delete from purchase_order_items where purchase_order_id in (select id from purchase_orders where supplier_id = (select id from restaurant_suppliers where name = '8G2B Test Foods'));
delete from purchase_orders where supplier_id = (select id from restaurant_suppliers where name = '8G2B Test Foods');
delete from restaurant_suppliers where name = '8G2B Test Foods';
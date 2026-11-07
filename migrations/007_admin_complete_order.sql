-- Migration: 007_admin_complete_order.sql
-- Adds a Supabase RPC function to atomically complete an order, debit buyer wallet, and record transaction.

create or replace function public.admin_complete_order(
    p_order_id uuid,
    p_admin_id uuid,
    p_verification_code text
) returns jsonb language plpgsql security definer as $$
declare
    v_order record;
    v_buyer record;
    v_balance numeric;
    v_price numeric;
    v_tx_ref text := 'MRKT-' || extract(epoch from now())::bigint;
    v_debit_ok boolean := false;
begin
    -- Verify admin role
    if not exists (select 1 from profiles where id = p_admin_id and (role = 'admin' or role = 'operator')) then
        raise exception 'Unauthorized: caller is not admin or operator';
    end if;

    -- Lock order row for update to prevent race conditions
    select * into v_order from marketplace_orders where id = p_order_id for update;
    if not found then
        raise exception 'Order not found';
    end if;

    if v_order.status = 'completed' then
        return jsonb_build_object('status','already_completed','message','Order already completed');
    end if;

    -- Get buyer profile and lock row
    select * into v_buyer from profiles where id = v_order.buyer_id for update;
    if not found then
        raise exception 'Buyer profile not found';
    end if;

    v_balance := coalesce(v_buyer.wallet_balance, v_buyer.balance, 0);
    v_price := v_order.price;
    if v_balance < v_price then
        return jsonb_build_object('status','insufficient_balance','message','Buyer balance too low');
    end if;

    -- Perform debit
    update profiles set wallet_balance = v_balance - v_price where id = v_buyer.id;
    v_debit_ok := true;

    -- Insert verification code message (as admin)
    insert into marketplace_messages (order_id, sender_id, message_type, content, code_value, created_at)
    values (p_order_id, p_admin_id, 'verification_code', 'Verification code provided by admin', p_verification_code, now());

    -- Update order status to completed
    update marketplace_orders set status = 'completed', verification_code = p_verification_code, verified_at = now(), completed_at = now() where id = p_order_id;

    -- Record transaction
    insert into transactions (user_id, type, amount, status, reference, description, created_at)
    values (v_buyer.id, 'marketplace', v_price, 'success', v_tx_ref, concat('Marketplace purchase order #', left(p_order_id::text,8)), now());

    return jsonb_build_object('status','ok','message','Order completed and wallet debited','transaction_ref',v_tx_ref);
exception
    when others then
        raise;
end;
$$;

-- Grant execution rights to authenticated users (checked inside function)
grant execute on function public.admin_complete_order(uuid, uuid, text) to anon, authenticated;

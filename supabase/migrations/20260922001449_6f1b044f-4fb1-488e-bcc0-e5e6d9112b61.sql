-- PROFILES
ALTER TABLE public.profiles RENAME COLUMN display_name TO full_name;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_income_cents INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- TRANSACTIONS
ALTER TABLE public.transactions RENAME COLUMN kind TO type;
ALTER TABLE public.transactions RENAME COLUMN occurred_on TO occurred_at_date;
ALTER TABLE public.transactions ADD COLUMN occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.transactions SET occurred_at = occurred_at_date::timestamptz;
ALTER TABLE public.transactions DROP COLUMN occurred_at_date;

ALTER TABLE public.transactions ADD COLUMN amount_cents INTEGER;
UPDATE public.transactions SET amount_cents = GREATEST(1, ROUND(amount * 100)::int);
ALTER TABLE public.transactions ALTER COLUMN amount_cents SET NOT NULL;
ALTER TABLE public.transactions DROP COLUMN amount;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_cents_positive CHECK (amount_cents > 0);

UPDATE public.transactions SET description = 'Sem descrição' WHERE description IS NULL OR btrim(description) = '';
ALTER TABLE public.transactions ALTER COLUMN description SET NOT NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_valid CHECK (type IN ('income', 'expense'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP INDEX IF EXISTS public.transactions_user_date_idx;
CREATE INDEX transactions_user_occurred_idx ON public.transactions (user_id, occurred_at DESC);

-- GOALS
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_cents INTEGER NOT NULL CHECK (target_amount_cents > 0),
  current_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (current_amount_cents >= 0),
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX goals_user_idx ON public.goals (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own goals" ON public.goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own goals" ON public.goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own goals" ON public.goals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- keep signup trigger in sync with renamed column
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
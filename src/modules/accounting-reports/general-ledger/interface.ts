export interface IJournal {
  _id?: string
  date?: Date
  form_number?: string
  coa_number?: string
  coa_name?: string
  subledger?: string
  description?: string
  debit?: number
  credit?: number
  created_at?: Date
  created_by_id?: string
}

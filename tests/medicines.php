<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/medicines.php';
final class MedicineResponse extends Exception {
    public function __construct(public array $data, public int $status) { parent::__construct('API response'); }
}
function respond(array $data, int $status=200): never { throw new MedicineResponse($data,$status); }
function check(bool $condition,string $message): void { if (!$condition) throw new RuntimeException($message); }
final class MedicineDatabase extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]); }
    public function exec(string $statement): int|false {
        if(str_contains($statement,'CREATE TABLE IF NOT EXISTS medicines')) $statement='CREATE TABLE IF NOT EXISTS medicines (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,ingredient TEXT,quantity TEXT,prescription TEXT,type TEXT)';
        return parent::exec($statement);
    }
}
$db=new MedicineDatabase();
function api(int $user,string $action,array $data=[]): MedicineResponse {
    global $db;
    try { handleMedicines($db,$user,'medicines.'.$action,$data); } catch(MedicineResponse $r) { return $r; }
    throw new RuntimeException('No response');
}
$medicine=['name'=>'Medicamento de teste','ingredient'=>'Princípio de teste','quantity'=>'30 unidades','prescription'=>'Prescrição fictícia para teste','type'=>'simples'];
$r=api(1,'save',$medicine);check($r->status===200,'Create medicine');$id=$r->data['id'];
check(count(api(1,'list')->data['items'])===1,'Owner can list');check(api(2,'list')->data['items']===[],'Other account cannot list');
check(api(2,'save',[...$medicine,'id'=>$id,'name'=>'Outro'])->status===404,'Other account cannot edit');
check(api(2,'delete',['id'=>$id])->status===404,'Other account cannot delete');
check(api(1,'save',[...$medicine,'type'=>'invalid'])->status===422,'Invalid recipe type');
check(api(1,'save',[...$medicine,'quantity'=>' '])->status===422,'Empty field');
check(api(1,'save',[...$medicine,'name'=>str_repeat('a',181)])->status===422,'Long field');
check(api(1,'save',[...$medicine,'id'=>$id,'type'=>'especial'])->status===200,'Update recipe type');
check(api(1,'list')->data['items'][0]['type']==='especial','Special type saved');
check(api(1,'save',[...$medicine,'id'=>$id,'type'=>'especial'])->status===200,'Unchanged update accepted');
check(api(1,'delete',['id'=>$id])->status===200,'Owner can delete');check(api(1,'list')->data['items']===[],'Deleted medicine gone');
echo "PASS: cadastro, edição, exclusão, validação e isolamento entre usuários.\n";

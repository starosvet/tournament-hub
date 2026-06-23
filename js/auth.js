const ADMIN="change-password";


function loginAdmin(pass){

if(pass===ADMIN){

localStorage.admin="true";

return true;

}


return false;

}


function isAdmin(){

return localStorage.admin==="true";

}

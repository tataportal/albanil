<?php
// Install in /home/albanil/nueva-private/maintenance.php, outside public_html.
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require '/home/albanil/public_html/nueva/api/lib.php';
require '/home/albanil/public_html/nueva/api/complaints.php';
require '/home/albanil/public_html/nueva/api/retention.php';
try{
    $sent=deliverComplaintMail();
    // Cron runs every five minutes for mail. Retention runs once per day.
    $stamp=__DIR__.'/retention-last-run';$purged=0;
    if(!is_file($stamp)||trim(file_get_contents($stamp))!==gmdate('Y-m-d')){
        $purged=purgeExpiredRequests();file_put_contents($stamp,gmdate('Y-m-d'),LOCK_EX);chmod($stamp,0600);
    }
    if($sent||$purged)echo now()." mail_accepted=$sent requests_deleted=$purged\n";
}catch(Throwable $e){error_log('Albanil maintenance failed: '.$e->getMessage());exit(1);}

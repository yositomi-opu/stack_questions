import unittest
from unittest.mock import patch
import translation

class TranslationTests(unittest.TestCase):
    def test_protected_math_markup_and_placeholders(self):
        source={'K1':{'true':'正解 {@X@} \\(x\\)','false':'<p>不正 [[input:ansD]]</p>'}}
        result={'K1':{'true':'Correct {@X@} \\(x\\)','false':'<p>Invalid [[input:ansD]]</p>'}}
        self.assertEqual(translation.validate(source,result),result)
        result['K1']['true']='Correct {@x@} \\(x\\)'
        with self.assertRaises(ValueError):translation.validate(source,result)
    def test_shared_provider_adapter_without_network(self):
        source={'K1':{'true':'正解 {@X@}','false':'誤答'}}
        response={'ok':True,'translations':{'en':{'question_text':None,'rows':[{'id':'option1C_1','choice':'Correct {@X@}','feedback':'Wrong'}]}}}
        with patch.object(translation.shared,'translate',return_value=response) as shared:
            result=translation.translate(dict(messages=source,sourceLanguage='ja',target='en'))
        self.assertEqual(result['K1']['true'],'Correct {@X@}');self.assertEqual(shared.call_args.args[0]['source']['rows'][0]['feedback'],'誤答')

if __name__=='__main__':unittest.main()
